import unittest
from datetime import datetime, timezone
from notion_timeline import collect_runs, group_runs, properties, rich, sync


def run(i, created='2026-08-28T15:01:00Z', **kw):
    return dict(id=i, event='push', head_branch='main', created_at=created,
                head_sha=f'{i:040x}', head_commit={'message': 'Add feature\nDetails'},
                html_url=f'https://github.com/owner/repo/actions/runs/{i}', **kw)


class TimelineTests(unittest.TestCase):
    def test_korean_midnight_and_reruns(self):
        a = run(1, '2026-08-28T14:59:00Z')
        b = run(2)
        other = dict(run(3), event='schedule')
        branch = dict(run(4), head_branch='feature')
        groups = group_runs([a, b, b, other, branch])
        self.assertEqual({d: len(v) for d, v in groups.items()},
                         {'2026-08-28': 1, '2026-08-29': 1})

    def test_summary_does_not_invent_commit_count(self):
        props = properties('owner/repo', 'project', '2026-08-29', [run(1), run(2)])
        self.assertEqual(props['Push 수']['number'], 2)
        self.assertNotIn('커밋 수', props)
        self.assertIn('Add feature', props['변경 내용']['rich_text'][0]['text']['content'])
        self.assertEqual(props['동기화 키']['rich_text'][0]['text']['content'],
                         'owner/repo|2026-08-29')

    def test_utf16_chunking(self):
        value = '🔥' * 2100
        chunks = rich(value)
        self.assertEqual(''.join(x['text']['content'] for x in chunks), value)
        self.assertTrue(all(len(x['text']['content'].encode('utf-16-le')) // 2 <= 1800
                            for x in chunks))

    def test_pagination_and_full_day_cutoff(self):
        paths = []
        def get(path):
            paths.append(path)
            return {'total_count': 101, 'workflow_runs':
                    [run(i) for i in range(100)] if len(paths) == 1 else [run(100)]}
        result = collect_runs(get, 'owner/repo', datetime(2026, 8, 28, 16, tzinfo=timezone.utc))
        self.assertEqual(len(result), 101)
        self.assertIn('2026-08-22T00%3A00%3A00%2B09%3A00', paths[0])
        self.assertIn('page=2', paths[1])

    def test_refuse_partial_totals(self):
        with self.assertRaises(RuntimeError):
            collect_runs(lambda _: {'total_count': 1001}, 'owner/repo',
                         datetime.now(timezone.utc))

    def test_upsert_preserves_manual_body_and_project_state(self):
        calls = []
        def notion(path, method, body):
            calls.append((path, method, body))
            if path.endswith('/query'):
                return {'results': [{'id': 'existing'}]}
            if method == 'GET':
                return {'properties': {'최근 활동일': {'date': {'start': '2026-09-01'}}}}
            return {}
        sync(notion, 'owner/repo', 'source', 'project', {'2026-08-29': [run(1)]})
        patch = next(c for c in calls if c[0] == '/pages/existing')
        self.assertEqual(set(patch[2]), {'properties'})
        self.assertNotIn('최근 활동일', calls[-1][2]['properties'])
        self.assertNotIn('진행 상태', calls[-1][2]['properties'])

    def test_create_and_duplicate_detection(self):
        calls = []
        def notion(path, method, body):
            calls.append((path, method, body))
            if path.endswith('/query'):
                return {'results': []}
            if method == 'GET':
                return {'properties': {}}
            return {}
        sync(notion, 'owner/repo', 'source', 'project', {'2026-08-29': [run(1)]})
        created = next(c for c in calls if c[0] == '/pages')
        self.assertEqual(created[2]['parent']['data_source_id'], 'source')
        with self.assertRaises(RuntimeError):
            sync(lambda *args: {'results': [{'id': 'a'}, {'id': 'b'}]},
                 'owner/repo', 'source', 'project', {'2026-08-29': [run(1)]})


if __name__ == '__main__':
    unittest.main()
