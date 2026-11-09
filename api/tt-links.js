/* 抖音 openid 和 openGym 账号之间的对应关系。
 *
 * 两处来源，按可信度排：db.ttLinks（用户主动绑定，权威）优先于 user.ttOpenId（第一次登录时
 * 自动建的那条记录）。绑定之后临时账号会被删掉，所以第二处通常已经不存在；留着它是为了
 * 兼容绑定功能上线之前登录过的人——他们的 openid 只记在账号上，仍然要能登进来。
 */

export function userForOpenId(db, openid) {
  if (!db || !openid) return null;
  const uid = db.ttLinks && db.ttLinks[openid];
  if (uid) {
    const hit = (db.users || []).find(u => u && u.id === uid);
    if (hit) return hit;             // 绑定有效
    // 绑定的账号被删了：别让 openid 变成幽灵，回退去找 auto 账号
  }
  return (db.users || []).find(u => u && u.ttOpenId === openid) || null;
}

/** 绑定：openid 指向已有账号。重复绑定是幂等的（同一个人扫两次不会多出东西）。 */
export function linkOpenId(db, openid, uid) {
  if (!db || !openid || !uid) return false;
  db.ttLinks = db.ttLinks || {};
  if (db.ttLinks[openid] === uid) return false;
  db.ttLinks[openid] = uid;
  return true;
}
