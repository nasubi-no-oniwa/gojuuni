// ランキングのルールの試験（GitHub の上で Firebase の試し用データベースを立てて試す。本番のデータには触らない）
const NS='ft-red-default-rtdb',PROJ='ft-red',BASE='http://127.0.0.1:9000';
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const tok=uid=>b64({alg:'none',typ:'JWT'})+'.'+b64({uid,sub:uid,user_id:uid,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,aud:PROJ,iss:'https://securetoken.google.com/'+PROJ,provider_id:'anonymous',firebase:{sign_in_provider:'anonymous'}})+'.';
async function req(method,path,uid,body){const r=await fetch(BASE+'/'+path+'.json?ns='+NS+(uid?'&auth='+tok(uid):''),{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {ok:r.ok,status:r.status,j:await r.json().catch(()=>null)};}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fail=0;const ex=(name,res,want)=>{const ok=res.ok===want;console.log((ok?'OK  ':'NG  ')+name+' → '+res.status);if(!ok){fail++;console.log(JSON.stringify(res.j));}};
const TS={'.sv':'timestamp'};const P='gojuu';
const U='owner1aaaaaaaaaaaaaaaaaa';
const gun=(u,n='テスト銃')=>({n,f:'b2l1',p:':0,0 4,0 8,0',th:0,sh:'800,1500',u,t:TS,v:1});
const reg=(uid,code,g)=>req('PATCH',P,uid,{['guns/'+code]:g||gun(uid),['last/'+uid]:{t:TS}});
ex('銃を登録する',await reg(U,'ABCD2345'),true);
ex('続けてすぐ登録はできない',await reg(U,'ABCD2346'),false);
ex('合言葉の形がちがう',await reg('other2bbbbbbbbbbbbbbbbbb','abcd2345'),false);
ex('同じ合言葉は上書きできない',await reg('other3cccccccccccccccccc','ABCD2345'),false);
ex('ほかの人の名前で登録できない',await req('PATCH',P,'other4dddddddddddddddddd',{['guns/ZZZZ2345']:gun(U),['last/other4dddddddddddddddddd']:{t:TS}}),false);
ex('撃つ数は3つまで',await req('PATCH',P,'other5eeeeeeeeeeeeeeeeee',{['guns/ZZZZ2346']:{...gun('other5eeeeeeeeeeeeeeeeee'),sh:'1,2,3,4'},['last/other5eeeeeeeeeeeeeeeeee']:{t:TS}}),false);
// 結果
const play=(uid,h,c,code='ABCD2345',extra)=>{const na=(c?c.a:0)+1,nh=(c?c.h:0)+h,D=Math.max(1,na-nh);const k=na>=10?Math.floor(nh*1000/D):-1;return req('PATCH',P,uid,{['res/'+code+'/'+uid]:{h,t:TS},['cnt/'+code]:{a:na,h:nh,k,n:'テスト銃',f:'b2l1',...(extra||{})}});};
ex('自分の銃は記録できない',await play(U,1,null),false);
ex('1人目（当たった）',await play('p00aaaaaaaaaaaaaaaaaaaaa',1,null),true);
ex('同じ人の2回目は記録できない',await play('p00aaaaaaaaaaaaaaaaaaaaa',1,{a:1,h:1}),false);
ex('回数をごまかせない',await req('PATCH',P,'p01aaaaaaaaaaaaaaaaaaaaa',{['res/ABCD2345/p01aaaaaaaaaaaaaaaaaaaaa']:{h:0,t:TS},['cnt/ABCD2345']:{a:5,h:1,k:-1,n:'テスト銃',f:'b2l1'}}),false);
ex('名前をごまかせない',await play('p01aaaaaaaaaaaaaaaaaaaaa',0,{a:1,h:1},'ABCD2345',{n:'ちがう'}),false);
let c={a:1,h:1};
for(let i=1;i<10;i++){const uid='p'+String(i).padStart(2,'0')+'aaaaaaaaaaaaaaaaaaaaa';const h=i%3===0?1:0;const r=await play(uid,h,c);ex((i+1)+'人目',r,true);if(r.ok)c={a:c.a+1,h:c.h+h};}
const cur=await req('GET',P+'/cnt/ABCD2345');console.log('いま',JSON.stringify(cur.j));
ex('10回目からK/Dがつく（k=1000*当て÷よけ）',{ok:cur.j&&cur.j.a===10&&cur.j.k===Math.floor(cur.j.h*1000/(cur.j.a-cur.j.h))},true);
ex('k をごまかせない',await req('PATCH',P,'p10aaaaaaaaaaaaaaaaaaaaa',{['res/ABCD2345/p10aaaaaaaaaaaaaaaaaaaaa']:{h:0,t:TS},['cnt/ABCD2345']:{a:11,h:c.h,k:99999,n:'テスト銃',f:'b2l1'}}),false);
ex('正しい k なら記録できる',await play('p10aaaaaaaaaaaaaaaaaaaaa',0,c),true);
ex('ランキングは読める',await req('GET',P+'/cnt'),true);
ex('ほかの人の最後の登録時刻は読めない',await req('GET',P+'/last/'+U,'p00aaaaaaaaaaaaaaaaaaaaa'),false);
console.log(fail?('失敗 '+fail+' 件'):'すべて OK');process.exit(fail?1:0);
