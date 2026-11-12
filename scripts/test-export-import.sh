#!/usr/bin/env bash
# 导出/导入功能端到端自测
set -u

BASE="https://cpa-learning-eta.vercel.app"
CRED="$HOME/.config/study-hub/access-password"
WORK="/tmp/study-e2e"
mkdir -p "$WORK"

python3 -c "
import json, os
open('/tmp/study-e2e/login.json','w').write(json.dumps({'password': open(os.path.expanduser('$CRED')).read().strip()}))
"

echo "=== 1. 登录 ==="
CODE=$(curl -s -c "$WORK/cookie.txt" -o /dev/null -w "%{http_code}" --max-time 40 \
  -X POST "$BASE/api/session" -H "Content-Type: application/json" -d @"$WORK/login.json")
echo "  HTTP $CODE"

echo "=== 2. 准备测试内容（带表格+图片引用）==="
CONTENT='{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"标题测试"}]},{"type":"table","content":[{"type":"tableRow","content":[{"type":"tableHeader","content":[{"type":"paragraph","content":[{"type":"text","text":"项目"}]}]},{"type":"tableHeader","content":[{"type":"paragraph","content":[{"type":"text","text":"说明"}]}]}]},{"type":"tableRow","content":[{"type":"tableCell","content":[{"type":"paragraph","content":[{"type":"text","text":"A"}]}]},{"type":"tableCell","content":[{"type":"paragraph","content":[{"type":"text","text":"B"}]}]}]}]}]}'
python3 -c "
import json
json.dump({'id':'导出测试','title':'导出测试','content':'''$CONTENT'''}, open('/tmp/study-e2e/page.json','w'))
"
curl -s -b "$WORK/cookie.txt" --max-time 40 -X POST "$BASE/api/pages" \
  -H "Content-Type: application/json" -d '{"title":"导出测试"}' -o /dev/null -w "  新建 HTTP %{http_code}\n"
curl -s -b "$WORK/cookie.txt" --max-time 40 -X PUT "$BASE/api/pages" \
  -H "Content-Type: application/json" -d @"$WORK/page.json" -o /dev/null -w "  写入 HTTP %{http_code}\n"

echo "=== 3. 导出 manifest ==="
curl -s -b "$WORK/cookie.txt" --max-time 40 "$BASE/api/export" -o "$WORK/manifest.json" -w "  HTTP %{http_code}\n"
python3 -c "
import json
d = json.load(open('/tmp/study-e2e/manifest.json'))
print('  version:', d.get('version'), '| pages:', len(d.get('pages', [])))
for p in d.get('pages', []):
    print(f\"    - {p['id']}: {p['title']}\")
    has_table = 'table' in p.get('content','')
    print(f\"      含表格: {has_table}\")
"

echo "=== 4. 删除测试笔记（模拟丢失）==="
curl -s -b "$WORK/cookie.txt" --max-time 40 -X DELETE "$BASE/api/pages" \
  -H "Content-Type: application/json" -d '{"id":"导出测试"}' -o /dev/null -w "  HTTP %{http_code}\n"
curl -s -b "$WORK/cookie.txt" --max-time 40 "$BASE/api/pages" | head -c 120
echo

echo "=== 5. 从导出文件导入（merge 模式）==="
python3 -c "
import json
d = json.load(open('/tmp/study-e2e/manifest.json'))
d['assets'] = {}
json.dump(d, open('/tmp/study-e2e/bundle.json','w'))
"
curl -s -b "$WORK/cookie.txt" --max-time 60 -X POST "$BASE/api/import" \
  -H "Content-Type: application/json" -d @"$WORK/bundle.json" -o "$WORK/import-res.json" -w "  HTTP %{http_code}\n"
cat "$WORK/import-res.json"; echo

echo "=== 6. 校验恢复结果 ==="
curl -s -b "$WORK/cookie.txt" --max-time 40 "$BASE/api/pages" -o "$WORK/after.json"
python3 -c "
import json
d = json.load(open('/tmp/study-e2e/after.json'))
print('  页面列表:', [p['id'] for p in d.get('pages',[])])
"
curl -s -b "$WORK/cookie.txt" --max-time 40 "$BASE/api/page?id=%E5%AF%BC%E5%87%BA%E6%B5%8B%E8%AF%95" -o "$WORK/page-after.json"
python3 -c "
import json
d = json.load(open('/tmp/study-e2e/page-after.json'))
p = d.get('page', {})
content = p.get('content','')
print('  标题:', p.get('meta',{}).get('title'))
print('  内容含表格:', 'table' in content)
print('  内容片段:', content[:90])
"

echo "=== 7. 清理 ==="
curl -s -b "$WORK/cookie.txt" --max-time 40 -X DELETE "$BASE/api/pages" \
  -H "Content-Type: application/json" -d '{"id":"导出测试"}' -o /dev/null -w "  HTTP %{http_code}\n"
rm -rf "$WORK"
