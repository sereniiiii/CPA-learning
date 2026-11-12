/**
 * 学习机制自测：用真实线上索引验证队列构建、间隔重排、掌握度衰减、错题归档。
 */
import {
  applyAnswer,
  buildTodayQueue,
  currentMastery,
  groupWrongByCause,
  updateWrongBook,
} from '/tmp/lc/learning.mjs'

import { readFileSync } from 'node:fs'

// 直接读本地生成的索引，避免网络依赖
const index = JSON.parse(
  readFileSync(
    process.env.IDX_PATH ?? '/Users/seren/WorkBuddy/2026-11-12-00-20-32/build/upload/index.json',
    'utf8',
  ),
)

console.log('=== 1. 今日队列（初始状态：全是新内容）===')
let state = { reviews: {}, wrongBook: {}, subjective: {}, updatedAt: '' }
let queue = buildTodayQueue(state, index.chapters, '2026-11-12')
console.log(`  队列长度: ${queue.length}`)
const byReason = {}
for (const q of queue) byReason[q.reason] = (byReason[q.reason] ?? 0) + 1
console.log('  按原因:', byReason)
console.log('  交错验证（前 30 个的章号，应跳跃而非连续）:')
console.log('   ', queue.slice(0, 30).map((q) => q.chapterNum).join(' '))
let runs = 1
for (let i = 1; i < 30; i++) if (queue[i].chapterNum === queue[i-1].chapterNum) runs++
console.log('  相邻同章次数:', runs - 1, '（交错良好时应接近 0）')

console.log('\n=== 2. 答对一个考点 ===')
const target = queue.find((q) => q.reason === 'new')
state = applyAnswer(state, target.pid, 'correct', '2026-11-12')
const rv = state.reviews[target.pid]
console.log(`  ${target.pid} 掌握度=${rv.mastery} 下次复习=${rv.due} 间隔档位=${rv.intervalIndex}`)

console.log('\n=== 3. 答错 + 错因归档 ===')
const wrongTarget = queue.find((q) => q.pid !== target.pid)
state = applyAnswer(state, wrongTarget.pid, 'wrong', '2026-11-12')
state = updateWrongBook(
  state,
  {
    pointId: wrongTarget.pid,
    chapterNum: wrongTarget.chapterNum,
    chapterTitle: wrongTarget.chapterTitle,
    pointTitle: wrongTarget.pointTitle,
    cause: '计算失误',
    selfRating: null,
  },
  true,
  '2026-11-12',
)
const wv = state.reviews[wrongTarget.pid]
console.log(`  ${wrongTarget.pid} 掌握度=${wv.mastery} 下次=${wv.due} 间隔档位=${wv.intervalIndex}（应为 0）`)
console.log('  错题本:', Object.keys(state.wrongBook).length, '条')
console.log('  按错因分组:', Object.keys(groupWrongByCause(state.wrongBook)))

console.log('\n=== 4. 掌握度衰减（30 天后）===')
const decayed = currentMastery(state, target.pid, '2026-12-12')
console.log(`  ${target.pid} 答对时 ${state.reviews[target.pid].mastery}% → 30天后 ${decayed}%`)
console.log('  预期约', Math.round(state.reviews[target.pid].mastery * Math.pow(0.97, 30)), '%')

console.log('\n=== 5. 间隔递增（连续答对 4 次）===')
let s2 = { reviews: {}, wrongBook: {}, subjective: {}, updatedAt: '' }
let day = '2026-11-12'
for (let i = 0; i < 4; i++) {
  s2 = applyAnswer(s2, 'ch01-p01', 'correct', day)
  const r = s2.reviews['ch01-p01']
  console.log(`  第${i + 1}次: 掌握度=${r.mastery}% 下次=${r.due} 档位=${r.intervalIndex}`)
  day = r.due
}

console.log('\n=== 6. 队列重排（答对的应排到未来，答错的留在今日）===')
queue = buildTodayQueue(state, index.chapters, '2026-11-12')
const wrongInQueue = queue.find((q) => q.pid === wrongTarget.pid)
console.log(`  答错的 ${wrongTarget.pid} 仍在今日队列: ${wrongInQueue ? '是' : '否'}`)
const correctInQueue = queue.find((q) => q.pid === target.pid)
console.log(`  答对的 ${target.pid} 还在今日队列: ${correctInQueue ? '是' : '否（已排到 11-13）'}`)
