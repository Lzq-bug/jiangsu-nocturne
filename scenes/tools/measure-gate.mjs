/**
 * Measure the gate scene for the submission report: per-station draw calls,
 * triangles, shader programs, frame rate, plus a scene inventory.
 *   node tools/measure-gate.mjs [url]
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.PORT || 9350);
const url = process.argv[2] || 'http://127.0.0.1:8765/gate/index.html';

const child = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=C:/tmp/edge-measure', '--window-size=1280,720',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  'about:blank',
], { stdio: 'ignore' });

let v = null;
for (let i = 0; i < 60; i++) {
  try { v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(300); }
}
if (!v) { child.kill(); throw new Error('Edge debugger did not start'); }

const ws = new WebSocket(v.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
  }
};
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const id = ++seq; pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});

const { targetId } = await send('Target.createTarget', { url });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Runtime.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }, sessionId);

const boot = await send('Runtime.evaluate', {
  expression: `(async()=>{const t0=Date.now();
    while(!window.dongfang?.hotspots && Date.now()-t0<120000) await new Promise(r=>setTimeout(r,200));
    if(!window.dongfang?.hotspots) throw new Error('boot failed');
    return Date.now()-t0;})()`,
  awaitPromise: true, returnByValue: true,
}, sessionId);
console.log('boot_ms(含 SwiftShader 编译):', boot.result.value);

const perStation = await send('Runtime.evaluate', {
  expression: `(async()=>{
    const {scene,camera,renderer,composer,STATIONS}=window.dongfang;
    renderer.info.autoReset=false;
    const out=[];
    for(let i=0;i<STATIONS.length;i++){
      window.dongfang.goToStation(i,{animate:false,info:false});
      window.dongfang.rig.update(0.016); camera.updateMatrixWorld(true);
      for(let k=0;k<4;k++) composer.render();          // warm up any new program
      renderer.info.reset();
      const t0=performance.now(); let f=0;
      while(performance.now()-t0<2500){ composer.render(); f++; }
      const dt=performance.now()-t0;
      const r=renderer.info.render;
      out.push({id:STATIONS[i].id, frames:f,
        calls:Math.round(r.calls/f), tris:Math.round(r.triangles/f),
        progs:renderer.info.programs?.length||0,
        geo:renderer.info.memory.geometries, tex:renderer.info.memory.textures,
        fps:+(f/(dt/1000)).toFixed(1)});
    }
    return JSON.stringify(out);
  })()`,
  awaitPromise: true, returnByValue: true,
}, sessionId);
console.log('per-station (每帧均值, 2.5s 连续渲染):');
for (const s of JSON.parse(perStation.result.value)) {
  console.log(`  ${s.id.padEnd(10)} calls=${String(s.calls).padStart(4)} tris=${String(s.tris).padStart(7)} progs=${s.progs} geo=${s.geo} tex=${s.tex} frames=${s.frames} fps=${s.fps}`);
}

const inventory = await send('Runtime.evaluate', {
  expression: `(()=>{
    const {scene}=window.dongfang;
    const stat={meshes:0,points:0,sprites:0,lights:0,tris:0,instanced:0,named:{}};
    const seen=new Set();
    scene.traverse(o=>{
      if(o.isMesh){stat.meshes++; if(o.isInstancedMesh){stat.instanced++; return;}
        const g=o.geometry; if(g&&!seen.has(g.uuid)&&!o.name.includes('mirror')){seen.add(g.uuid);
          stat.tris += (g.index?g.index.count:g.attributes.position.count)/3;}}
      if(o.isPoints){stat.points++; const c=o.geometry.attributes.position.count; stat.named['points:'+o.name]=c;}
      if(o.isSprite)stat.sprites++;
      if(o.isLight)stat.lights++;
      if(o.name)stat.named[o.name]=(stat.named[o.name]||0)+1;
    });
    const mirror=scene.getObjectByName('reflections');
    let mt=0; if(mirror) mirror.traverse(o=>{ if(o.isMesh&&o.geometry){const g=o.geometry; mt+=(g.index?g.index.count:g.attributes.position.count)/3;} });
    stat.tris=Math.round(stat.tris); stat.mirrorTris=Math.round(mt);
    return JSON.stringify(stat,null,1);
  })()`,
  returnByValue: true,
}, sessionId);
console.log('inventory:');
console.log(inventory.result.value);

// how many window cells are actually lit, counted from the emissive canvas
const facade = await send('Runtime.evaluate', {
  expression: `(()=>{
    const {scene}=window.dongfang;
    let found=null;
    scene.traverse(o=>{ if(!found && o.isMesh && !Array.isArray(o.material) && o.material?.emissiveMap?.image?.getContext) found=o.material.emissiveMap.image; });
    // the gate body is the only mesh with a material array; read it directly
    const body=scene.getObjectByName('gate-body');
    const cv=(Array.isArray(body.material)?body.material:[body.material]).map(m=>m.emissiveMap).find(Boolean)?.image;
    const c=cv||found; if(!c) return 'no canvas';
    const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let lit=0; for(let i=3;i<d.length;i+=4) if(d[i]>8) lit++;
    const px=c.width*c.height;
    return JSON.stringify({size:c.width, litPx:lit, coverPct:+(100*lit/px).toFixed(1)});
  })()`,
  returnByValue: true,
}, sessionId);
console.log('facade windows:', facade.result.value);

ws.close(); child.kill(); process.exit(0);
