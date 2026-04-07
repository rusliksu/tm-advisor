const fs = require('fs');
const {readGeneratedExtensionFile} = require('./lib/generated-extension-data');
const raw1 = readGeneratedExtensionFile('card_effects.json.js', 'utf8');
const fn1 = new Function(raw1.replace(/^const /, 'var ') + '\nreturn TM_CARD_EFFECTS;');
const E = fn1();
const raw2 = readGeneratedExtensionFile('ratings.json.js', 'utf8');
const fn2 = new Function(raw2.replace(/^const /, 'var ') + '\nreturn TM_RATINGS;');
const R = fn2();

const FTN = {0:[8,0,8],1:[8,.5,7.5],2:[8,1.2,6.8],3:[8,2,6],4:[7.9,2.9,5],5:[7.8,3.9,3.9],6:[7.6,4.8,2.8],7:[7.4,5.4,2],8:[7.2,5.6,1.6],9:[7.1,5.7,1.4]};
const PM = {mp:1,sp:1.6,tp:2.5,pp:1.6,ep:1.5,hp:.8};
const RV = {mc:1,st:2,ti:3,pl:1.6,he:.5,en:1,cd:3};
function cv(fx,gl) {
  var r=FTN[Math.min(9,gl)];var tr=r[0],pd=r[1],vp=r[2];var v=0;
  for(var k of ['mp','sp','tp','pp','ep','hp']) if(fx[k]) v+=fx[k]*pd*PM[k];
  for(var k of ['mc','st','ti','pl','he','en','cd']) if(fx[k]) v+=fx[k]*RV[k];
  if(fx.tr) v+=fx.tr*tr; if(fx.vp) v+=fx.vp*vp;
  if(fx.tmp) v+=fx.tmp*tr; if(fx.o2) v+=fx.o2*tr; if(fx.oc) v+=fx.oc*(tr+3); if(fx.vn) v+=fx.vn*tr;
  if(fx.grn) v+=fx.grn*(tr+vp+3); if(fx.city) v+=fx.city*(3+vp*2);
  if(fx.rmPl) v+=fx.rmPl*1.6*.5; if(fx.pOpp) v+=Math.abs(fx.pOpp)*pd*.5;
  if(fx.vpAcc) v+=fx.vpAcc*gl*vp/Math.max(1,fx.vpPer||1);
  if(fx.actMC) v+=fx.actMC*gl; if(fx.actTR) v+=fx.actTR*gl*tr;
  if(fx.actOc) v+=fx.actOc*gl*(tr+4); if(fx.actCD) v+=fx.actCD*gl*3;
  return v;
}

var evs = [];
for(var name in E) {
  var fx = E[name];
  if(fx.c == null || fx.c === 0) continue; // Skip corps/preludes
  var fields = Object.keys(fx).filter(k => k !== 'c' && k !== 'minG' && fx[k] !== 0 && fx[k] != null).length;
  if(fields < 2) continue; // Skip poorly modeled cards
  var val = cv(fx, 5);
  var cost = (fx.c||0) + 3;
  var ev = val - cost;
  var evNorm = Math.max(10, Math.min(98, Math.round(65 + ev * 1.5)));
  var cotd = R[name] ? R[name].s : null;
  evs.push({name, val: Math.round(val), cost, ev: Math.round(ev), evNorm, cotd});
}
evs.sort((a,b) => b.ev - a.ev);
console.log('TOP 20:');
evs.slice(0,20).forEach(e => console.log('  ' + e.name + ': EV=' + e.ev + ' (val=' + e.val + ' cost=' + e.cost + ') COTD=' + e.cotd));
console.log('\nMID (around median):');
var mid = Math.floor(evs.length/2);
evs.slice(mid-5,mid+5).forEach(e => console.log('  ' + e.name + ': EV=' + e.ev + ' (val=' + e.val + ' cost=' + e.cost + ') COTD=' + e.cotd));
console.log('\nBOTTOM 20:');
evs.slice(-20).forEach(e => console.log('  ' + e.name + ': EV=' + e.ev + ' (val=' + e.val + ' cost=' + e.cost + ') COTD=' + e.cotd));

// Stats
var sorted = evs.map(e => e.ev).sort((a,b) => a-b);
console.log('\nStats: min=' + sorted[0] + ' max=' + sorted[sorted.length-1] + ' median=' + sorted[mid]);
console.log('p10=' + sorted[Math.floor(evs.length*0.1)] + ' p25=' + sorted[Math.floor(evs.length*0.25)] + ' p75=' + sorted[Math.floor(evs.length*0.75)] + ' p90=' + sorted[Math.floor(evs.length*0.9)]);
console.log('Total cards with effects: ' + evs.length);

// Correlation with COTD
var both = evs.filter(e => e.cotd != null);
var n = both.length;
var sx = 0, sy = 0, sxy = 0, sx2 = 0, sy2 = 0;
both.forEach(e => { sx += e.ev; sy += e.cotd; sxy += e.ev * e.cotd; sx2 += e.ev * e.ev; sy2 += e.cotd * e.cotd; });
var r = (n * sxy - sx * sy) / Math.sqrt((n * sx2 - sx * sx) * (n * sy2 - sy * sy));
console.log('\nCorrelation EV vs COTD (r): ' + r.toFixed(3) + ' (n=' + n + ')');

// Big disagreements
console.log('\nBiggest EV > COTD (EV overrates):');
both.sort((a,b) => (b.ev - b.cotd) - (a.ev - a.cotd));
both.slice(0,10).forEach(e => console.log('  ' + e.name + ': EV=' + e.ev + ' COTD=' + e.cotd + ' diff=' + (e.ev - e.cotd)));
console.log('\nBiggest COTD > EV (EV underrates):');
both.slice(-10).forEach(e => console.log('  ' + e.name + ': EV=' + e.ev + ' COTD=' + e.cotd + ' diff=' + (e.ev - e.cotd)));
