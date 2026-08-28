"""Reconcile push-triggered workflow runs into daily Notion activity cards."""
import json
import os
import sys
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

KST = ZoneInfo('Asia/Seoul')
WORKFLOW = 'notion-timeline.yml'


def api(base, path, token, method='GET', body=None):
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    if 'notion.com' in base:
        headers['Notion-Version'] = '2025-09-03'
    else:
        headers['Accept'] = 'application/vnd.github+json'
        headers['X-GitHub-Api-Version'] = '2022-11-28'
    request = Request(base + path, data=None if body is None else json.dumps(body).encode(),
                      headers=headers, method=method)
    for attempt in range(5):
        try:
            with urlopen(request, timeout=30) as response:
                return json.load(response)
        except HTTPError as error:
            # Do not retry uncertain page creations: retrying could duplicate a card.
            safe_retry = method in ('GET', 'PATCH') or path.endswith('/query')
            if attempt < 4 and (error.code == 429 or (safe_retry and error.code >= 500)):
                time.sleep(min(30, int(error.headers.get('Retry-After', 2 ** attempt))))
                continue
            raise RuntimeError(f'API request failed: HTTP {error.code} ({method} {path})') from None


def timestamp(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def collect_runs(get, repo, now):
    # Calendar-day boundary avoids reducing a card to a partial day's counts.
    cutoff = (now.astimezone(KST).date() - timedelta(days=7)).isoformat()
    start = datetime.fromisoformat(cutoff).replace(tzinfo=KST).isoformat()
    runs = []
    for page in range(1, 11):
        params = urlencode({'event': 'push', 'branch': 'main', 'created': '>=' + start,
                            'per_page': 100, 'page': page})
        result = get(f'/repos/{repo}/actions/workflows/{WORKFLOW}/runs?{params}')
        if result.get('total_count', 0) > 1000:
            raise RuntimeError('More than 1000 runs in the recovery window; refusing partial totals.')
        batch = result['workflow_runs']
        runs.extend(batch)
        if len(batch) < 100:
            return runs
    return runs


def group_runs(runs):
    groups = defaultdict(dict)
    for run in runs:
        if run.get('event') != 'push' or run.get('head_branch') != 'main':
            continue
        day = timestamp(run['created_at']).astimezone(KST).date().isoformat()
        groups[day][run['id']] = run  # Re-runs keep their original run ID.
    return {day: sorted(items.values(), key=lambda r: (r['created_at'], r['id']))
            for day, items in groups.items()}


def rich(value):
    # Notion rich text allows at most 100 segments, 2000 UTF-16 units each.
    chunks, chunk, size = [], '', 0
    for char in value:
        width = len(char.encode('utf-16-le')) // 2
        if size + width > 1800:
            chunks.append({'type': 'text', 'text': {'content': chunk}})
            chunk, size = '', 0
        chunk += char
        size += width
    if chunk:
        chunks.append({'type': 'text', 'text': {'content': chunk}})
    if len(chunks) > 100:
        raise RuntimeError('Daily summary exceeds Notion limits; refusing truncation.')
    return chunks


def properties(repo, project_id, day, runs):
    latest = runs[-1]
    lines = []
    for run in runs:
        message = (run.get('head_commit') or {}).get('message') or run['head_sha'][:7]
        subject = message.splitlines()[0][:300]
        clock = timestamp(run['created_at']).astimezone(KST).strftime('%H:%M')
        lines.append(f'{clock} · {subject}\n{run["html_url"]}')
    latest_message = (latest.get('head_commit') or {}).get('message') or latest['head_sha'][:7]
    title = f'{repo.split("/")[-1]} · {latest_message.splitlines()[0][:120]}'
    return {
        '작업': {'title': rich(title)},
        '프로젝트': {'relation': [{'id': project_id}]},
        '활동일': {'date': {'start': day}},
        '변경 내용': {'rich_text': rich('\n\n'.join(lines))},
        'Push 수': {'number': len(runs)},
        '브랜치': {'multi_select': [{'name': 'main'}]},
        '마지막 Push': {'date': {'start': latest['created_at']}},
        'GitHub 링크': {'url': f'https://github.com/{repo}/commit/{latest["head_sha"]}'},
        '기록 출처': {'select': {'name': 'Push 자동 기록'}},
        '동기화 키': {'rich_text': rich(f'{repo}|{day}')},
        '처리한 이벤트': {'rich_text': rich(','.join(str(r['id']) for r in runs))},
    }


def sync(notion, repo, source_id, project_id, groups):
    for day, runs in sorted(groups.items()):
        result = notion(f'/data_sources/{source_id}/query', 'POST', {
            'filter': {'property': '동기화 키', 'rich_text': {'equals': f'{repo}|{day}'}}})
        pages = result['results']
        if len(pages) > 1 or result.get('has_more'):
            raise RuntimeError(f'Duplicate daily cards for {day}; resolve before syncing.')
        props = properties(repo, project_id, day, runs)
        if pages:
            notion(f'/pages/{pages[0]["id"]}', 'PATCH', {'properties': props})
        else:
            notion('/pages', 'POST', {
                'parent': {'type': 'data_source_id', 'data_source_id': source_id},
                'properties': props})
    project = notion(f'/pages/{project_id}', 'GET', None)
    project_props = {'연동 상태': {'select': {'name': '연동 중'}}}
    if groups:
        newest = max(groups)
        previous = (project['properties'].get('최근 활동일', {}).get('date') or {}).get('start')
        if not previous or newest >= previous[:10]:
            project_props['최근 활동일'] = {'date': {'start': newest}}
    notion(f'/pages/{project_id}', 'PATCH', {'properties': project_props})


def main():
    required = ['GITHUB_REPOSITORY', 'GITHUB_TOKEN', 'NOTION_TOKEN',
                'NOTION_ACTIVITY_SOURCE_ID', 'NOTION_PROJECT_PAGE_ID']
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        raise RuntimeError('Missing configuration: ' + ', '.join(missing))
    env = os.environ
    get = lambda path: api('https://api.github.com', path, env['GITHUB_TOKEN'])
    notion = lambda path, method, body: api('https://api.notion.com/v1', path,
                                            env['NOTION_TOKEN'], method, body)
    groups = group_runs(collect_runs(get, env['GITHUB_REPOSITORY'], datetime.now(timezone.utc)))
    sync(notion, env['GITHUB_REPOSITORY'], env['NOTION_ACTIVITY_SOURCE_ID'],
         env['NOTION_PROJECT_PAGE_ID'], groups)
    print(f'Synced {len(groups)} activity days. Commit totals are intentionally not inferred.')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Never print headers, tokens, raw responses, or commit content to logs.
        print(f'Sync failed: {error if isinstance(error, RuntimeError) else type(error).__name__}',
              file=sys.stderr)
        sys.exit(1)
