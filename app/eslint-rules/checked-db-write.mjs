/**
 * db() 로 쓰는데 결과를 안 보는 코드를 막는다.
 *
 * 왜 이 규칙이 있는가 — 2026-08-26 감사에서 실제로 난 사고:
 *   달력 마감을 완료하면 네 곳이 같이 움직이는데(일정·할일·지표·기록),
 *   그중 세 곳이 `await db().from(...).insert(...)` 로 error 를 안 보고 있었다.
 *   중간에 하나가 실패하면 달력엔 체크가 남았는데 지표는 안 오른 상태로 조용히 끝나고,
 *   앱은 성공했다고 답한다. Supabase 클라이언트는 던지지 않고 { data, error } 를 돌려주므로
 *   결과를 안 보면 실패가 어디에도 안 남는다.
 *
 * 통과하는 두 가지 (레포에 이미 있는 정상 패턴 그대로):
 *   ① run('설명', () => db().from('x').insert(...))      ← run() 이 error 를 확인하고 던진다
 *   ② const { error } = await db().from('x').insert(...)  ← 직접 받아서 확인한다
 *
 * 읽기(select)는 대상이 아니다 — 실패해도 빈 결과로 화면이 비는 정도라 성격이 다르다.
 */

const WRITES = new Set(['insert', 'update', 'upsert', 'delete']);

/** 체인을 거슬러 올라가 뿌리가 db() 호출인지 본다. db().from('x').insert(...).eq(...) 형태. */
function rootsAtDb(node) {
  let cur = node;
  for (let hop = 0; hop < 40 && cur; hop += 1) {
    if (cur.type === 'CallExpression') {
      if (cur.callee.type === 'Identifier' && cur.callee.name === 'db') return true;
      cur = cur.callee;
    } else if (cur.type === 'MemberExpression') {
      cur = cur.object;
    } else {
      return false;
    }
  }
  return false;
}

/** 이 체인 어딘가에 쓰기 메서드가 있나. */
function writeMethodOf(node) {
  let cur = node;
  for (let hop = 0; hop < 40 && cur; hop += 1) {
    if (cur.type === 'CallExpression') {
      const callee = cur.callee;
      if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier'
          && WRITES.has(callee.property.name)) {
        return callee.property.name;
      }
      cur = callee;
    } else if (cur.type === 'MemberExpression') {
      cur = cur.object;
    } else {
      return null;
    }
  }
  return null;
}

/** 위로 올라가며 run(...) 의 인자 안에 있는지 본다 (화살표 함수 안이어도 된다). */
function insideRunCall(node) {
  let cur = node;
  while (cur.parent) {
    const parent = cur.parent;
    if (parent.type === 'CallExpression' && parent.arguments.includes(cur)
        && parent.callee.type === 'Identifier' && parent.callee.name === 'run') {
      return true;
    }
    // 함수 경계를 넘어도 계속 올라간다 — run('x', () => db()...) 가 그 형태다.
    cur = parent;
  }
  return false;
}

/** `const { error } = await ...` / `const { data, error: xErr } = await ...` 로 받혔나. */
function destructuredWithError(awaitNode) {
  const parent = awaitNode.parent;
  if (!parent) return false;
  const pattern = parent.type === 'VariableDeclarator' ? parent.id
    : parent.type === 'AssignmentExpression' ? parent.left
      : null;
  if (!pattern || pattern.type !== 'ObjectPattern') return false;
  return pattern.properties.some(
    (p) => p.type === 'Property' && p.key.type === 'Identifier' && p.key.name === 'error',
  );
}

const checkedDbWrite = {
  meta: {
    type: 'problem',
    docs: { description: 'db() 쓰기는 run() 을 거치거나 error 를 확인해야 한다' },
    schema: [],
    messages: {
      unchecked:
        "db().{{method}}() 의 결과를 안 보고 있습니다. run('설명', () => …) 으로 감싸거나 "
        + 'const { error } = await … 로 받아서 확인하세요. '
        + '(실패가 조용히 묻히면 연쇄가 반만 적용된 채로 남습니다)',
    },
  },
  create(context) {
    return {
      AwaitExpression(node) {
        const arg = node.argument;
        if (!arg || (arg.type !== 'CallExpression' && arg.type !== 'MemberExpression')) return;
        if (!rootsAtDb(arg)) return;
        const method = writeMethodOf(arg);
        if (!method) return;
        if (insideRunCall(node)) return;
        if (destructuredWithError(node)) return;
        context.report({ node, messageId: 'unchecked', data: { method } });
      },
    };
  },
};

export default checkedDbWrite;
