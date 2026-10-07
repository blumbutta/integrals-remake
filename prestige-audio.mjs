/** Original synthesized prestige sound. No network requests or sampled recordings. */
export function createPrestigeAudio(){
  let context=null,destroyed=false,active=null;
  const voices=new Set();
  function audioContext(){
    if(destroyed)return null;
    const Constructor=globalThis.AudioContext||globalThis.webkitAudioContext;
    if(!Constructor)return null;
    try{context??=new Constructor();return context;}catch{return null;}
  }
  // Call directly in a user gesture, before awaiting a cloud mutation.
  function prepare(){
    const ctx=audioContext();if(!ctx)return Promise.resolve(false);
    try{return Promise.resolve(ctx.state==='suspended'?ctx.resume():undefined).then(()=>!destroyed&&ctx.state!=='closed').catch(()=>false);}catch{return Promise.resolve(false);}
  }
  function cleanup(voice){
    clearTimeout(voice.timer);clearTimeout(voice.fadeTimer);
    for(const source of voice.sources){try{source.stop();}catch{}}
    for(const node of voice.nodes){try{node.disconnect();}catch{}}
    voices.delete(voice);if(active===voice)active=null;
  }
  function stopVoice(voice,immediate=false){
    if(!voice)return;clearTimeout(voice.timer);clearTimeout(voice.fadeTimer);
    if(immediate||!context||context.state!=='running'){cleanup(voice);return;}
    const now=context.currentTime;
    try{voice.master.gain.cancelScheduledValues(now);voice.master.gain.setTargetAtTime(0,now,.015);}catch{}
    for(const source of voice.sources){try{source.stop(now+.075);}catch{}}
    voice.fadeTimer=setTimeout(()=>cleanup(voice),100);if(active===voice)active=null;
  }
  function stop(){stopVoice(active);}
  function play({volume=.7,durationMs=6500}={}){
    const ctx=audioContext();if(!ctx)return false;
    stop();
    try{if(ctx.state==='suspended')void ctx.resume().catch(()=>{});}catch{return false;}
    const seconds=Math.max(1.2,Math.min(15,(Number(durationMs)||6500)/1000));
    const level=Math.max(0,Math.min(1,Number.isFinite(Number(volume))?Number(volume):.7));
    if(level===0)return false;
    const start=ctx.currentTime+.018,collapse=start+seconds*.72,reveal=start+seconds*.83,end=start+seconds;
    const voice={sources:[],nodes:[],master:ctx.createGain(),timer:0,fadeTimer:0};voices.add(voice);
    try{
    const track=node=>{voice.nodes.push(node);return node;};
    track(voice.master);voice.master.gain.setValueAtTime(0,start);voice.master.gain.linearRampToValueAtTime(level*.44,start+.22);voice.master.gain.setValueAtTime(level*.44,end-.16);voice.master.gain.linearRampToValueAtTime(0,end+.05);
    const compressor=track(ctx.createDynamicsCompressor());compressor.threshold.value=-15;compressor.knee.value=18;compressor.ratio.value=5;compressor.attack.value=.006;compressor.release.value=.12;
    voice.master.connect(compressor);compressor.connect(ctx.destination);
    const oscillator=(type,frequency,when,until,peak=.12)=>{
      const source=track(ctx.createOscillator()),gain=track(ctx.createGain());source.type=type;source.frequency.setValueAtTime(frequency,when);
      const duration=Math.max(.01,until-when),attack=Math.min(.18,duration*.2),release=Math.min(.17,duration*.45);
      gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(peak,when+attack);gain.gain.setValueAtTime(peak,Math.max(when+attack,until-release));gain.gain.linearRampToValueAtTime(0,until);
      source.connect(gain);gain.connect(voice.master);source.start(when);source.stop(until+.02);voice.sources.push(source);return {source,gain};
    };
    // Deep, slowly tightening oscillators establish the pull of the singularity.
    for(const [index,frequency]of [36.71,55,73.42].entries()){
      const {source,gain}=oscillator(index===1?'triangle':'sine',frequency,start,collapse+.17,index===1?.065:.13);
      source.frequency.exponentialRampToValueAtTime(frequency*1.42,collapse-.15);
      gain.gain.setValueAtTime(index===1?.065:.13,start+.2);gain.gain.linearRampToValueAtTime(index===1?.11:.18,collapse-.08);gain.gain.linearRampToValueAtTime(0,collapse+.17);
    }
    // A filtered, newly generated noise stream is the rising air, not a loud impact.
    const length=Math.max(1,Math.floor(ctx.sampleRate*2));
    const buffer=ctx.createBuffer(1,length,ctx.sampleRate),samples=buffer.getChannelData(0);let previous=0;
    for(let i=0;i<length;i++){previous=(previous+Math.random()*.12-.06)/1.025;samples[i]=previous*2.4;}
    const noise=track(ctx.createBufferSource());noise.buffer=buffer;noise.loop=true;
    const filter=track(ctx.createBiquadFilter());filter.type='bandpass';filter.Q.setValueAtTime(.65,start);filter.frequency.setValueAtTime(90,start);filter.frequency.exponentialRampToValueAtTime(3300,collapse);filter.frequency.exponentialRampToValueAtTime(110,reveal);
    const noiseGain=track(ctx.createGain());noiseGain.gain.setValueAtTime(0,start);noiseGain.gain.linearRampToValueAtTime(.055,start+seconds*.24);noiseGain.gain.exponentialRampToValueAtTime(.48,collapse);noiseGain.gain.linearRampToValueAtTime(0,reveal+.07);
    noise.connect(filter);filter.connect(noiseGain);noiseGain.connect(voice.master);noise.start(start);noise.stop(reveal+.1);voice.sources.push(noise);
    // Three compact low pulses follow the buildings into the hole.
    for(let i=0;i<3;i++){
      const when=start+seconds*(.49+i*.08),duration=Math.min(.29,seconds*.055);
      const {source}=oscillator('sine',84-i*11,when,when+duration,.22);source.frequency.exponentialRampToValueAtTime(31,when+duration);
    }
    // A consonant G-major resolution opens the next world, gently fading into play.
    for(const [index,frequency]of [196,246.94,293.66,392].entries()){
      const when=reveal+index*.035;
      oscillator('sine',frequency,when,end+.08,.115);
      oscillator('sine',frequency*2,when,end,.026);
    }
    const {source:shimmer}=oscillator('sine',784,reveal,end,.035);shimmer.frequency.exponentialRampToValueAtTime(1174.66,end);
    active=voice;voice.timer=setTimeout(()=>cleanup(voice),(seconds+.22)*1000);
    return true;
    }catch{cleanup(voice);return false;}
  }
  function destroy(){if(destroyed)return;destroyed=true;for(const voice of [...voices])stopVoice(voice,true);active=null;if(context){try{void context.close().catch(()=>{});}catch{}context=null;}}
  return {prepare,play,stop,destroy,get playing(){return !!active;}};
}
