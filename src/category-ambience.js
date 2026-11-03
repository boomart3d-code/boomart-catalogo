/* User-initiated collection music and a short, non-blocking themed celebration. */
(() => {
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const audio = document.createElement('audio');
  audio.id = 'collectionAudio'; audio.preload = 'none'; audio.loop = true; audio.volume = .18;
  audio.hidden = true; document.body.append(audio);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let current = null, loading = false, request = 0, frame = 0, cleanupTimer = 0, canvas = null;
  const dock = document.createElement('div');
  dock.className = 'ambient-dock'; dock.hidden = true;
  dock.innerHTML = '<span class="ambient-equalizer" aria-hidden="true"><i></i><i></i><i></i></span><span class="ambient-dock-copy"><strong></strong><small>Música activada</small></span><button type="button" aria-label="Pausar música de ambiente">Ⅱ</button>';
  document.body.append(dock);
  dock.querySelector('button').addEventListener('click', () => stop());

  function clearEffect() {
    cancelAnimationFrame(frame); clearTimeout(cleanupTimer); canvas?.remove(); canvas = null;
  }
  function sync(message = '') {
    const playing = !audio.paused && !loading;
    for (const button of document.querySelectorAll('[data-ambient]')) {
      button.setAttribute('aria-pressed', String(playing));
      button.setAttribute('aria-busy', String(loading));
      const compact=button.classList.contains('ambient-compact');
      button.querySelector('.ambient-action').textContent = loading ? (compact?'Cargando…':'Preparando música…') : playing ? (compact?'Pausar':'Pausar ambiente') : compact?'Ambiente':'Activar ambiente';
      const status = document.querySelector('#v2AudioStatus');
      if (status) status.textContent = message || (playing ? 'Sonando · volumen suave' : 'Toca para escuchar y ver el efecto');
    }
    dock.hidden = !playing;
    dock.querySelector('strong').textContent = current?.short || '';
  }
  function stop(reset = false) {
    request++; loading = false; audio.pause(); clearEffect();
    if (reset && audio.readyState) audio.currentTime = 0;
    sync();
  }

  const palettes = {
    magic: ['#ffd97d','#fff1c9','#b49ce7','#d8b05f'],
    cosmos: ['#f6d990','#89cafa','#fff3d8','#c5b4ef'],
    hyrule: ['#e8c963','#8ac898','#f2e8af','#73b9a5'],
    heroes: ['#d5e5f3','#e26057','#ddb963','#93b9d6'],
    christmas: ['#b44b4a','#8ab499','#e6c873','#fff1d1'],
    cosplay: ['#e7c590','#dc8c63','#9caec7','#f0e3c9'],
    plants: ['#6da883','#a2c48c','#eed26e','#e3e8bc'],
    football: ['#e9cc75','#75b09b','#e8eee5','#c78c65'],
    gaming: ['#a4d6bb','#d4b56a','#85a9db','#e2d3f2'],
    figures: ['#e4b76b','#cf7168','#83b0cc','#b8c88f'],
  };
  function shape(ctx, kind, size) {
    if (kind === 'wand') {
      ctx.lineWidth = Math.max(2, size*.12); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-size*.8,size*.65); ctx.lineTo(size*.65,-size*.65); ctx.stroke();
      ctx.beginPath(); ctx.arc(size*.65,-size*.65,size*.18,0,Math.PI*2); ctx.fill();
    } else if (kind === 'triangle') {
      for (const [x,y] of [[0,-.48],[-.45,.3],[.45,.3]]) {
        ctx.beginPath();ctx.moveTo((x)*size,(y-.38)*size);ctx.lineTo((x-.37)*size,(y+.25)*size);ctx.lineTo((x+.37)*size,(y+.25)*size);ctx.closePath();ctx.fill();
      }
    } else if (kind === 'leaf') {
      ctx.beginPath();ctx.moveTo(-size*.7,size*.5);ctx.quadraticCurveTo(-size,-size,size*.7,-size*.5);ctx.quadraticCurveTo(size,size,-size*.7,size*.5);ctx.fill();
    } else if (kind === 'bolt') {
      ctx.beginPath();ctx.moveTo(size*.3,-size);ctx.lineTo(-size*.5,0);ctx.lineTo(0,0);ctx.lineTo(-size*.3,size);ctx.lineTo(size*.6,-size*.18);ctx.lineTo(size*.1,-size*.18);ctx.closePath();ctx.fill();
    } else if (kind === 'feather') {
      ctx.beginPath();ctx.moveTo(0,size);ctx.quadraticCurveTo(-size,-size,0,-size);ctx.quadraticCurveTo(size,-size,0,size);ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,-size);ctx.lineTo(0,size);ctx.stroke();
    } else if (kind === 'snow') {
      for(let i=0;i<6;i++){ctx.save();ctx.rotate(i*Math.PI/3);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-size);ctx.moveTo(0,-size*.55);ctx.lineTo(-size*.25,-size*.8);ctx.moveTo(0,-size*.55);ctx.lineTo(size*.25,-size*.8);ctx.stroke();ctx.restore();}
    } else if (kind === 'shield') {
      ctx.beginPath();ctx.moveTo(-size*.65,-size*.7);ctx.lineTo(size*.65,-size*.7);ctx.quadraticCurveTo(size*.8,size*.4,0,size);ctx.quadraticCurveTo(-size*.8,size*.4,-size*.65,-size*.7);ctx.stroke();
    } else if (kind === 'helmet') {
      ctx.beginPath();ctx.arc(0,0,size*.65,Math.PI,0);ctx.lineTo(size*.65,size*.7);ctx.lineTo(-size*.65,size*.7);ctx.closePath();ctx.stroke();
      ctx.beginPath();ctx.moveTo(-size*.5,0);ctx.lineTo(size*.5,0);ctx.moveTo(0,0);ctx.lineTo(0,size*.6);ctx.stroke();
    } else if (kind === 'controller') {
      ctx.beginPath();ctx.moveTo(-size*.55,-size*.3);ctx.quadraticCurveTo(-size,-size*.3,-size,size*.55);ctx.quadraticCurveTo(-size*.6,size*.8,-size*.3,size*.3);ctx.lineTo(size*.3,size*.3);ctx.quadraticCurveTo(size*.6,size*.8,size,size*.55);ctx.quadraticCurveTo(size,-size*.3,size*.55,-size*.3);ctx.closePath();ctx.stroke();
      ctx.beginPath();ctx.moveTo(-size*.65,0);ctx.lineTo(-size*.25,0);ctx.moveTo(-size*.45,-size*.2);ctx.lineTo(-size*.45,size*.2);ctx.stroke();ctx.beginPath();ctx.arc(size*.5,0,2,0,Math.PI*2);ctx.fill();
    } else if (kind === 'coin' || kind === 'orb') {
      ctx.beginPath();ctx.ellipse(0,0,size*.55,size*.8,0,0,Math.PI*2);ctx.stroke();ctx.fillRect(-size*.06,-size*.4,size*.12,size*.8);
    } else if (kind === 'meteor') {
      ctx.beginPath();ctx.moveTo(-size*1.8,size);ctx.lineTo(0,0);ctx.stroke();ctx.beginPath();ctx.arc(0,0,size*.25,0,Math.PI*2);ctx.fill();
    } else if (kind === 'confetti') {
      ctx.fillRect(-size*.16,-size*.5,size*.32,size);
    } else if (kind === 'rupee') {
      ctx.beginPath();ctx.moveTo(0,-size);ctx.lineTo(size*.45,-size*.5);ctx.lineTo(size*.45,size*.5);ctx.lineTo(0,size);ctx.lineTo(-size*.45,size*.5);ctx.lineTo(-size*.45,-size*.5);ctx.closePath();ctx.stroke();
    } else if (kind === 'ball') {
      ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,0,size*.6,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();for(let i=0;i<6;i++){const a=i*Math.PI*2/5-Math.PI/2;const x=Math.cos(a)*size*.25,y=Math.sin(a)*size*.25;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();
    } else {
      ctx.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,r=i%2?size*.22:size;const x=Math.cos(a)*r,y=Math.sin(a)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fill();
    }
  }
  function celebrate(button, tone) {
    clearEffect();
    // No full-screen motion for people who request reduced motion.
    if (motion.matches) { button.classList.add('ambient-gentle'); setTimeout(()=>button.classList.remove('ambient-gentle'),500); return; }
    const width=innerWidth,height=innerHeight,rect=button.getBoundingClientRect();
    const origin={x:Math.max(12,Math.min(width-12,rect.left+rect.width*.7)),y:Math.max(12,Math.min(height-12,rect.top+rect.height/2))};
    canvas=document.createElement('canvas'); canvas.className='ambient-celebration';canvas.setAttribute('aria-hidden','true');
    const ratio=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
    document.body.append(canvas); const ctx=canvas.getContext('2d'); if(!ctx){clearEffect();return;}ctx.scale(ratio,ratio);
    const colors=palettes[tone]||palettes.figures;
    const kinds=({magic:['wand','star','bolt','confetti','feather','star'],cosmos:['meteor','star','meteor','confetti'],hyrule:['triangle','rupee','leaf','star'],plants:['leaf','leaf','star'],football:['ball','star','confetti'],gaming:['controller','bolt','orb','star'],heroes:['shield','bolt','star','confetti'],christmas:['snow','star','confetti'],cosplay:['helmet','star','bolt'],figures:['coin','star','confetti']})[tone]||['star','confetti'];
    const particles=Array.from({length:width<600?54:88},(_,i)=>{
      const side=i%3;return {color:colors[i%colors.length],kind:kinds[i%kinds.length],size:(i%5===0?15:6)+Math.random()*8,spin:(Math.random()-.5)*8,delay:Math.random()*.12,
        x1:origin.x+(Math.random()-.5)*width*1.7,y1:origin.y-height*(.25+Math.random()*.55),
        x2:Math.random()*width,y2:-height*.15+Math.random()*height*.5,
        x3:side===0?-80:side===1?width+80:Math.random()*width,y3:side===2?height+70:height*(.2+Math.random()*.95)};
    });
    const started=performance.now();
    function draw(now) {
      const elapsed=(now-started)/2000;if(elapsed>=1){clearEffect();return;}
      ctx.clearRect(0,0,width,height);
      for(const p of particles){const t=Math.max(0,Math.min(1,(elapsed-p.delay)/(1-p.delay))),u=1-t;
        if(!t)continue;const x=u*u*u*origin.x+3*u*u*t*p.x1+3*u*t*t*p.x2+t*t*t*p.x3,y=u*u*u*origin.y+3*u*u*t*p.y1+3*u*t*t*p.y2+t*t*t*p.y3;
        ctx.save();ctx.translate(x,y);ctx.rotate(p.spin*t);ctx.globalAlpha=Math.min(1,t*9)*Math.min(1,(1-t)*5)*.9;ctx.fillStyle=p.color;ctx.strokeStyle=p.color;ctx.lineWidth=1.8;
        if(p.kind==='star'||p.kind==='wand'){ctx.shadowColor=p.color;ctx.shadowBlur=9;}shape(ctx,p.kind,p.size);ctx.restore();
      }
      frame=requestAnimationFrame(draw);
    }
    frame=requestAnimationFrame(draw);cleanupTimer=setTimeout(clearEffect,2000);
  }
  async function toggle(theme,button) {
    if(loading||!audio.paused){stop();return;}
    if(!theme.audio)return;
    const id=++request;current=theme;loading=true;sync();
    const desired=new URL(theme.audio,document.baseURI).href;
    if(audio.src!==desired)audio.src=desired;
    else if(audio.error)audio.load();
    try {
      // Called directly from the click handler: mobile browsers allow this gesture.
      await audio.play();
      if(id!==request)return;
      loading=false;sync();celebrate(button,theme.tone);
    } catch(error) {
      if(id!==request)return;
      loading=false;audio.pause();sync('No se pudo reproducir. Toca para reintentar.');
    }
  }
  function markup(theme) {
    if(!theme.audio)return '';
    return `<div class="v2-ambient"><button type="button" data-ambient aria-pressed="false" aria-describedby="v2AudioStatus"><span class="ambient-play" aria-hidden="true">♫</span><span><strong class="ambient-action">Activar ambiente</strong><small>Música + efecto de 2 segundos</small></span><span class="ambient-button-spark" aria-hidden="true">✦</span></button><small class="ambient-track">${esc(theme.track)} · volumen suave</small><span role="status" id="v2AudioStatus">Toca para escuchar y ver el efecto</span></div>`;
  }
  function toolbar(theme) {
    if(!theme.audio)return '';
    return `<button type="button" class="ambient-compact" data-ambient aria-pressed="false" aria-label="Música y efecto de ${esc(theme.short)}"><span aria-hidden="true">♫</span><strong class="ambient-action">Ambiente</strong></button>`;
  }
  audio.addEventListener('error',()=>{if(current){loading=false;sync('Audio no disponible. Toca para reintentar.');}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  addEventListener('pagehide',()=>stop());addEventListener('resize',clearEffect);
  motion.addEventListener('change',()=>{if(motion.matches)clearEffect();});
  audio.addEventListener('pause',()=>sync());
  window.BoomArtAmbience={markup,toolbar,toggle,stop,sync};
})();
