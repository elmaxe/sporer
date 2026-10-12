import{$o as e,Ao as t,B as n,Bn as r,Cn as i,Co as a,Dn as o,Do as s,H as c,Hn as l,Ho as u,In as d,Jr as f,Jt as ee,Li as te,Lt as p,Qi as m,Qo as h,R as ne,Ra as re,Rn as g,Sn as _,To as v,U as ie,Uo as y,V as b,W as x,Yi as S,Zt as ae,_o as oe,_r as C,a as w,at as T,c as E,co as se,dr as ce,ho as D,ht as O,i as le,ir as ue,lo as de,mt as k,n as fe,nn as A,no as j,o as pe,oo as M,ot as me,qo as N,rr as P,to as F,uo as I,wn as L,z as R}from"./FpsCounter-DMobKDYl.js";var z=16,he=56,B=8,ge=class{el=document.getElementById(`tooltip`);nameEl=document.getElementById(`tooltip-name`);infoEl=document.getElementById(`tooltip-info`);detailsEl=document.getElementById(`tooltip-details`);extraEl=document.getElementById(`tooltip-extra`);subject=null;width=0;height=0;claimed=!1;showClaimed(e,...t){this.claimed=!1,this.show(...t),this.claimed=!0,this.setTone(e)}release(){this.claimed&&(this.claimed=!1,this.setTone(null),this.hide())}setTone(e){e?this.el.dataset.tone=e:delete this.el.dataset.tone}show(e,t,n,r,i,a,o=!1,s){if(this.claimed)return;e!==this.subject&&(this.subject=e,this.nameEl.textContent=t,this.infoEl.textContent=n,this.detailsEl.textContent=a??``,this.detailsEl.hidden=!a,this.extraEl.replaceChildren(),s?.(this.extraEl),this.extraEl.hidden=!s,this.el.hidden=!1,this.width=this.el.offsetWidth,this.height=this.el.offsetHeight);let c=o?r-this.width/2:r+z,l=o?i-he-this.height:i+z;c=Math.max(B,Math.min(c,window.innerWidth-this.width-B)),l=Math.max(B,Math.min(l,window.innerHeight-this.height-B)),this.el.style.transform=`translate(${c}px, ${l}px)`}hide(){this.claimed||this.subject===null||(this.subject=null,this.el.hidden=!0)}},V={length:.35,opacity:.35,highlight:.7,moonOpacity:.3,headWidth:1.2,tailWidth:4,minPixels:3,nearFade:40,endOn:.5,moonRange:5},H=128,U=10,_e=`#b4c2de`,ve=.35,ye=class{scene;camera;highlighted;root=new D;geometry=be(H);planetTrails;moonTrails;shared={time:{value:0},minWidth:{value:0},nearFade:{value:V.nearFade},endOn:{value:V.endOn},span:{value:V.length*Math.PI*2}};scratch=new e;constructor(e,t,n,r,i,a){this.scene=e,this.camera=t,this.highlighted=i,this.root.name=`Orbit trails`,this.planetTrails=n.map(e=>this.createTrail(e)),this.moonTrails=r.map(e=>this.createTrail(e)),e.add(this.root);let o=a.folder(`Orbit trails`);o?.add(V,`length`,.05,1),o?.add(V,`opacity`,0,1),o?.add(V,`highlight`,0,1),o?.add(V,`moonOpacity`,0,1),o?.add(V,`headWidth`,.1,4),o?.add(V,`tailWidth`,.1,10),o?.add(V,`minPixels`,0,10),o?.add(V,`nearFade`,0,200),o?.add(V,`endOn`,0,1),o?.add(V,`moonRange`,1,20),o?.add(this.root,`visible`).name(`show`)}set visible(e){this.root.visible=e}get visible(){return this.root.visible}get visibleCount(){let e=0;for(let t of[...this.planetTrails,...this.moonTrails])t.mesh.visible&&e++;return e}get count(){return this.planetTrails.length+this.moonTrails.length}update(e){let t=V,n=this.shared;n.time.value+=e,n.nearFade.value=t.nearFade,n.endOn.value=t.endOn,n.span.value=t.length*Math.PI*2,n.minWidth.value=t.minPixels*2*Math.tan(s.degToRad(this.camera.fov)/2)/innerHeight;let r=1-Math.exp(-8*e);for(let e of this.planetTrails)this.place(e,e.body.renderPosition),this.ease(e,this.highlighted(e.body)?t.highlight:t.opacity,r);for(let e of this.moonTrails){let n=e.body.parent;e.mesh.position.copy(n.renderPosition),this.place(e,this.scratch.subVectors(e.body.renderPosition,n.renderPosition));let i=n.standoff*t.moonRange,a=this.camera.position.distanceTo(n.renderPosition),o=1-s.smoothstep(a,i,i*2);this.ease(e,this.highlighted(e.body)?t.highlight:t.moonOpacity*o,r)}}dispose(){this.scene.remove(this.root),this.geometry.dispose();for(let{mesh:e}of[...this.planetTrails,...this.moonTrails])e.material.dispose()}place(e,t){let n=e.mesh.material.uniforms;n.angle.value=r(e.body.config.orbit,t),n.headWidth.value=e.body.radius*V.headWidth,n.tailWidth.value=e.body.radius*V.tailWidth}ease(e,t,n){e.opacity+=(t-e.opacity)*n,e.mesh.material.uniforms.opacity.value=e.opacity,e.mesh.visible=e.opacity>.003}createTrail(e){let{config:n}=e,r=n.atmosphere??(O(n)?n.bands[n.bands.length>>1]:n.style.high),i=Math.max(e.radius,n.rings?.outer??0),a=new N({uniforms:{...this.shared,color:{value:new M(_e).lerp(new M(r),ve)},opacity:{value:0},angle:{value:0},radius:{value:n.orbit.radius},inclination:{value:n.orbit.inclination},node:{value:n.orbit.node??0},headWidth:{value:1},tailWidth:{value:1},body:{value:e.renderPosition},reach:{value:i},seed:{value:n.seed%1e3*.37}},vertexShader:xe,fragmentShader:Se,side:2,blending:2,transparent:!0,depthWrite:!1}),o=new t(this.geometry,a);return o.name=`${e.name} trail`,o.frustumCulled=!1,o.visible=!1,this.root.add(o),{body:e,mesh:o,opacity:0}}};function be(e){let t=new Float32Array((e+1)*2*2),n=[];for(let r=0;r<=e;r++){let i=r/e;if(t.set([i,-1,i,1],r*4),r<e){let e=r*2;n.push(e,e+1,e+2,e+1,e+3,e+2)}}let r=new j;return r.setAttribute(`trail`,new F(t,2)),r.setAttribute(`position`,new F(new Float32Array((e+1)*2*3),3)),r.setIndex(n),r}var xe=`
  attribute vec2 trail;
  uniform float angle;
  uniform float span;
  uniform float radius;
  uniform float inclination;
  uniform float node;
  uniform float headWidth;
  uniform float tailWidth;
  uniform float minWidth;
  varying vec2 vTrail;
  varying float vAngle;
  varying float vWidth;
  varying float vThin;
  varying float vAcross;
  varying float vSteady;
  varying vec3 vWorld;

  // A point on the orbit at angle a, in world space, and the orbit's direction there.
  vec3 orbitPoint(float a, out vec3 tangent) {
    float si = sin(inclination);
    float ci = cos(inclination);
    // Turned about +Y by the node (Orbit.node).
    mat3 turn = mat3(cos(node), 0.0, -sin(node), 0.0, 1.0, 0.0, sin(node), 0.0, cos(node));
    tangent = normalize(mat3(modelMatrix) * (turn * vec3(-sin(a), cos(a) * si, cos(a) * ci)));
    return (modelMatrix * vec4(turn * (radius * vec3(cos(a), sin(a) * si, sin(a) * ci)), 1.0)).xyz;
  }

  // Across the orbit at angle a, perpendicular to the view; its length is the
  // sine of the angle between the orbit and the line of sight.
  vec3 acrossAt(float a) {
    vec3 tangent;
    vec3 p = orbitPoint(a, tangent);
    return cross(tangent, normalize(cameraPosition - p));
  }

  void main() {
    float t = trail.x;
    // Back along the orbit from the body (orbits run towards increasing angle).
    float a = angle - t * span;
    vec3 tangent;
    vec3 world = orbitPoint(a, tangent);

    // Face the camera: spread across the orbit, perpendicular to the view.
    vec3 toCamera = cameraPosition - world;
    vec3 across = cross(tangent, normalize(toCamera));
    vAcross = length(across);
    // No width where it points straight at the camera.
    vec3 side = across / max(vAcross, 1e-6);
    // Where the orbit runs along the line of sight the side turns over within
    // a few segments, and the quads fan out into a star or cross over each
    // other: fade the ribbon wherever it twists that fast.
    float segment = span / ${H}.0;
    vec3 before = acrossAt(a + segment);
    vec3 after = acrossAt(a - segment);
    float turn = min(dot(side, before / max(length(before), 1e-6)), dot(side, after / max(length(after), 1e-6)));
    vSteady = smoothstep(${Math.cos(s.degToRad(U)).toFixed(4)}, ${Math.cos(s.degToRad(U/3)).toFixed(4)}, turn);
    float w = mix(headWidth, tailWidth, t);
    float width = max(w, minWidth * length(toCamera));
    world += side * trail.y * width * 0.5;

    vTrail = trail;
    vAngle = a;
    vWidth = width;
    // Trails widened to the minimum on-screen width are fainter, like a thin wisp.
    vThin = sqrt(w / width);
    vWorld = world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }`,Se=`
  uniform vec3 color;
  uniform float opacity;
  uniform float radius;
  uniform float headWidth;
  uniform float time;
  uniform float seed;
  uniform vec3 body;
  uniform float reach;
  uniform float nearFade;
  uniform float endOn;
  varying vec2 vTrail;
  varying float vAngle;
  varying float vWidth;
  varying float vThin;
  varying float vAcross;
  varying float vSteady;
  varying vec3 vWorld;
  ${m}

  void main() {
    float t = vTrail.x;
    float s = vTrail.y;
    // Noise anchored along the orbit (round the circle, so it never jumps) in
    // units of the head's width: the texture stays where the body left it,
    // stretches as the trail widens, and churns slowly.
    float scale = radius / (headWidth * 1.6);
    vec3 p = vec3(cos(vAngle) * scale, sin(vAngle) * scale, s * vWidth / (headWidth * 1.6));
    p += vec3(seed, seed * 0.7, time * 0.06);
    float n = fbm(p, 4);
    float wisps = fbm(p * 3.1 + vec3(0.0, 0.0, time * 0.1), 3);

    // Ragged edges: the noise eats into the ribbon, more so towards the tail.
    float edge = 1.0 - smoothstep(0.35 - 0.2 * t, 1.0, abs(s) + (n - 0.5) * (0.5 + 0.6 * t));
    float density = smoothstep(0.2, 0.75, n * 0.75 + wisps * 0.35 + 0.2 * (1.0 - t));
    // Fades in just behind the body and thins out along the tail.
    float fade = smoothstep(0.0, 0.04, t) * pow(1.0 - t, 1.4);
    float gap = smoothstep(reach * 0.9, reach * 1.6, distance(vWorld, body));
    float near = smoothstep(nearFade * 0.2, nearFade, distance(vWorld, cameraPosition));
    float sideways = smoothstep(endOn * 0.25, endOn, vAcross) * vSteady;

    float a = opacity * edge * density * fade * gap * near * sideways * vThin;
    gl_FragColor = vec4(color, a);
    #include <colorspace_fragment>
  }`,W={stream:.015,fresh:.35,reach:.1,nearFade:60},G=720,Ce=`
  attribute float aAnomaly;   // mean anomaly of the point, radians
  uniform float uComet;       // the comet's mean anomaly now
  uniform float uHabitable;
  uniform float uStream;
  uniform float uFresh;
  uniform float uReach;
  uniform float uNearFade;
  varying float vBrightness;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    // Behind the comet (it sheds dust that lags) the fresh trail reaches further than ahead of it.
    float d = uComet - aAnomaly;
    d -= 6.2831853 * floor(d / 6.2831853 + 0.5);
    float reach = uReach * 6.2831853 * (d > 0.0 ? 1.0 : 0.083);
    float fresh = exp(-(d / reach) * (d / reach));
    // Lit by the star (1/r, squeezed so the far orbit still shows faintly).
    float light = min(uHabitable / max(length(world.xyz), 1.0), 3.0);
    float near = smoothstep(uNearFade * 0.3, uNearFade, distance(world.xyz, cameraPosition));
    vBrightness = (uStream + uFresh * fresh) * light * near;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`,we=`
  uniform vec3 uColor;
  varying float vBrightness;
  void main() {
    gl_FragColor = vec4(uColor * vBrightness, 1.0);
    #include <colorspace_fragment>
  }
`,Te=class{scene;data;line;uniforms;constructor(t,n,r){this.scene=t,this.data=n;let{orbit:i}=n,o=new Float32Array(G*3),s=new Float32Array(G),c=new e,l={...i,phase:0};for(let e=0;e<G;e++){let t=2*Math.PI*e/G,n=t-i.eccentricity*Math.sin(t);g(l,n/(2*Math.PI)*i.period,c),o.set([c.x,c.y,c.z],e*3),s[e]=n}let u=new j;u.setAttribute(`position`,new F(o,3)),u.setAttribute(`aAnomaly`,new F(s,1)),this.uniforms={uComet:{value:0},uHabitable:{value:r},uStream:{value:W.stream},uFresh:{value:W.fresh},uReach:{value:W.reach},uNearFade:{value:W.nearFade},uColor:{value:new M(n.dustColor)}},this.line=new a(u,new N({vertexShader:Ce,fragmentShader:we,uniforms:this.uniforms,blending:2,depthWrite:!1,transparent:!0})),this.line.name=`${n.name} dust trail`,this.line.frustumCulled=!1,t.add(this.line)}animate(e){let{orbit:t}=this.data,n=this.uniforms;n.uComet.value=t.phase+2*Math.PI*e/t.period,n.uStream.value=W.stream,n.uFresh.value=W.fresh,n.uReach.value=W.reach,n.uNearFade.value=W.nearFade}update(){}dispose(){this.scene.remove(this.line),this.line.geometry.dispose(),this.line.material.dispose()}};function Ee(e){let t=e.folder(`Comet dust trails`);t?.add(W,`stream`,0,.5),t?.add(W,`fresh`,0,2),t?.add(W,`reach`,.005,.3),t?.add(W,`nearFade`,0,300)}function De(e,t,n){let r=new Uint8Array(t*n),i=e%1e3/97;for(let e=0;e<n;e++){let a=(e+.5)/n;for(let n=0;n<t;n++){let o=2*Math.PI*(n+.5)/t,s=b(Math.cos(o)*3,Math.sin(o)*3,a*5+i,3),c=b(Math.cos(o)*11,Math.sin(o)*11,a*19+i*1.7,2),l=.45+1.1*s*(.6+.8*c);r[e*t+n]=Math.round(255*Math.min(2,l)/2)}}return r}var K={discBrightness:1.1,debrisBrightness:.15,lightPower:.35,forward:.45,debrisForward:.3,debrisSlantCap:.4,maxLight:2,midplane:.3,tauPower:.5,slantCap:.15,contrast:.6,debrisBandDepth:.6,clumps:.55,near:30,far:260},Oe=[-.7,0,.7],ke=[-.5,0,.5],q=[512,128],J=96,Y=100,X=`
  attribute float aBase;              // the smooth disc's density here (gen/discs.ts smoothDustDensity)
  attribute float aRel;               // its structure: gaps < 1 < rings (dustStructure)
  uniform float uLayer;               // height in scale heights
  uniform float uOuter;
  uniform float uAspect;
  uniform float uFlare;
  uniform float uWobble;
  uniform float uHabitable;
  uniform float uLightPower;
  uniform float uMaxLight;
  uniform vec3 uStar;                 // star (barycentre) in world space
  varying vec3 vWorld;
  varying vec2 vLocal;
  varying float vBase;
  varying float vRel;
  varying float vLight;
  void main() {
    vec3 p = position;
    float r = length(p.xz);
    float a = atan(p.z, p.x);
    vBase = aBase;
    vRel = aRel;
    vLocal = p.xz;
    // A flared sheet: H = aspect · outer · (r / outer)^flare. Each one undulates a little (differently), so
    // seen edge-on the sheets' edges interleave into a smooth band instead of showing as separate lines.
    float x = r / uOuter;
    float wobble = uWobble * (sin(a * 5.0 + uLayer * 3.7 + x * 9.0) + sin(a * 3.0 - uLayer * 1.3 - x * 13.0));
    p.y = (uLayer + wobble) * uAspect * uOuter * pow(x, uFlare);
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    // Lit by the star: 1/d² squeezed.
    vLight = min(pow(uHabitable / max(distance(world.xyz, uStar), 1.0), 2.0 * uLightPower), uMaxLight);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`,Ae=`
  uniform sampler2D uClumpMap;        // see discClumps.ts
  uniform float uClumps;
  uniform float uInner;
  uniform float uTaper;               // the dust thins out from here to the outer edge
  uniform float uOuter;
  uniform float uLogSpan;             // log(outer / inner)
  uniform float uTime;
  uniform float uOmega;               // angular speed at the inner edge (rad/s); Kepler's ∝ r^-1.5 outside it
  uniform vec2 uSpiral;               // strength, pitch
  uniform float uTauPower;            // the column is squeezed (stylised), so the outer disc still shows
  uniform float uLayerWeight;         // this sheet's share of the column
  uniform float uDepth;               // optical depth at the inner edge, face on
  uniform float uSlantCap;
  uniform float uGrazeFade;
  uniform float uInside;
  uniform float uContrast;
  uniform float uOpaque;
  uniform float uShade;               // how much light this sheet gets
  uniform float uBrightness;
  uniform float uForward;
  uniform vec3 uColor;
  uniform vec3 uStar;
  uniform vec2 uFade;
  varying vec3 vWorld;
  varying vec2 vLocal;
  varying float vBase;
  varying float vRel;
  varying float vLight;

  void main() {
    if (vBase <= 0.0) discard;
    vec3 toEye = cameraPosition - vWorld;
    float dist = length(toEye);
    float fade = smoothstep(uFade.x, uFade.y, dist);
    if (fade <= 0.0) discard;
    // Clumps carried round at the local orbital speed (so they shear like the real thing), and a spiral in some.
    float r = length(vLocal);
    float lr = log(r / uInner);
    float a = atan(vLocal.y, vLocal.x) - uTime * uOmega * pow(r / uInner, -1.5);
    float clump = texture2D(uClumpMap, vec2(a / 6.2831853, lr / uLogSpan)).r * ${2 .toFixed(1)};
    float rel = vRel * mix(1.0, clump, uClumps);
    if (uSpiral.x > 0.0) rel *= 1.0 + uSpiral.x * cos(2.0 * (a - uSpiral.y * lr));
    vec3 v = toEye / dist;
    // A sheet seen at a slant holds more dust along the line of sight (capped: from inside it would be infinite).
    float slant = 1.0 / max(abs(v.y), uSlantCap);
    // A debris disc's sheets hand over to its band near edge-on (the band fades in as they fade out), so the
    // gap between sheets doesn't show as a dark wedge along the plane.
    slant *= mix(1.0, smoothstep(0.06, 0.35, abs(v.y)), uGrazeFade * uInside);
    float tau = uDepth * pow(vBase * rel, uTauPower) * uLayerWeight * slant;
    // Thinning out towards both edges (the disc is thick right up to them otherwise): edge-on or from a little
    // above, the stacked sheets' hard edges showed as steps.
    float edges = smoothstep(uInner, uInner * 1.6, r) * (1.0 - smoothstep(uTaper, uOuter, r));
    float alpha = (1.0 - exp(-tau)) * fade * edges;
    // Scattered forwards (Henyey–Greenstein, relative to isotropic, capped).
    float g = uForward;
    float c = dot(normalize(vWorld - uStar), v);
    float phase = min((1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5), 4.0);
    // Rings shine and gaps are dark even where the dust is thick enough to hide what's behind it.
    vec3 col = uColor * vLight * phase * uShade * uBrightness * pow(max(rel, 0.0), uContrast);
    // Premultiplied: a young disc's thick dust hides what's behind it; a debris disc's is too thin to, and only adds light.
    gl_FragColor = vec4(col * alpha, alpha * uOpaque);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`,Z=1.3,Q=[96,16],je=`
  uniform float uHeight;              // the disc's scale height at the wall
  uniform float uHabitable;
  uniform float uLightPower;
  uniform float uMaxLight;
  uniform float uLightAt;             // lit as dust this far from the star is, not the wall itself
  varying vec3 vWorld;
  varying float vAcross;              // height over the scale height
  varying vec2 vRound;                // the wall's outward direction (x, z), unnormalised
  varying float vLight;
  void main() {
    vAcross = position.y / uHeight;
    vRound = position.xz;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vLight = min(pow(uHabitable / max(uLightAt, 1.0), 2.0 * uLightPower), uMaxLight);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`,Me=`
  uniform float uBandDepth;
  uniform float uInside;              // 1 with the camera inside the dust layer (where the band shows), 0 above it
  uniform float uBrightness;
  uniform float uForward;
  uniform vec3 uColor;
  uniform vec3 uStar;
  uniform vec2 uFade;
  varying vec3 vWorld;
  varying float vAcross;
  varying vec2 vRound;
  varying float vLight;
  void main() {
    vec3 toEye = cameraPosition - vWorld;
    float dist = length(toEye);
    vec3 v = toEye / dist;
    // Only from inside the dust layer, and there near edge-on, as the sheets fade out (their uGrazeFade): the two
    // hand over. From above the layer a far wall would stand up behind the star like a screen.
    float edgeOn = 1.0 - smoothstep(0.06, 0.35, abs(v.y));
    // And fading out where the wall turns away to its outline (seen along the wall), so the band has no hard ends.
    float facing = abs(dot(normalize(vec3(vRound.x, 0.0, vRound.y)), v));
    float fade = smoothstep(uFade.x, uFade.y, dist) * edgeOn * smoothstep(0.0, 0.5, facing) * uInside;
    if (fade <= 0.0) discard;
    float s = vAcross;
    // The column along the plane: Gaussian in height.
    float tau = uBandDepth * exp(-s * s * 2.0);
    float alpha = (1.0 - exp(-tau)) * fade * (1.0 - smoothstep(1.0, ${Z.toFixed(1)}, abs(s)));
    // Its light comes from all the dust along the line of sight, most of it nearer the star than the wall:
    // scattered by the angle between the line of sight and the star (the elongation), not the wall's own.
    float g = uForward;
    float c = dot(normalize(uStar - cameraPosition), -v);
    float phase = min((1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5), 4.0);
    vec3 col = uColor * vLight * phase * uBrightness;
    // Thin dust: it only adds light.
    gl_FragColor = vec4(col * alpha, 0.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`,Ne=class{scene;data;object=new D;geometry;sheets=[];shared;clumpMap;layers;band;local=new e;star=new e;constructor(e,n,r,i,a){this.scene=e,this.data=n;let o=n.kind===`protoplanetary`,s=new M(r[0]?_(r[0]):`#ffffff`),c=new M(n.color).multiply(s);this.clumpMap=new de(De(n.seed,...q),...q,u),this.clumpMap.wrapS=y,this.clumpMap.magFilter=this.clumpMap.minFilter=v,this.clumpMap.needsUpdate=!0;let l=n.inner*.98;this.shared={uClumpMap:{value:this.clumpMap},uInner:{value:l},uLogSpan:{value:Math.log(n.outer/l)},uTaper:{value:n.taper},uOuter:{value:n.outer},uAspect:{value:n.aspect},uFlare:{value:n.flare},uWobble:{value:o?0:.1},uSpiral:{value:new h(n.spiral,n.pitch)},uClumps:{value:o?K.clumps:K.clumps*.3},uTime:{value:0},uOmega:{value:2*Math.PI/a},uDepth:{value:n.depth},uTauPower:{value:K.tauPower},uSlantCap:{value:o?K.slantCap:K.debrisSlantCap},uContrast:{value:o?K.contrast:0},uOpaque:{value:+!!o},uGrazeFade:{value:+!o},uInside:{value:0},uBrightness:{value:1},uHabitable:{value:i},uLightPower:{value:K.lightPower},uMaxLight:{value:K.maxLight},uForward:{value:o?K.forward:K.debrisForward},uColor:{value:c},uStar:{value:this.star},uFade:{value:new h(K.near,K.far)}},this.geometry=Pe(n,l),this.layers=o?ke:Oe;let d=this.layers.map(e=>Math.exp(-(e*e)/2)),f=d.reduce((e,t)=>e+t,0);this.layers.forEach((e,n)=>{let r=new N({vertexShader:X,fragmentShader:Ae,uniforms:{...this.shared,uLayer:{value:0},uLayerWeight:{value:0},uShade:{value:1}},blending:5,blendSrc:201,blendDst:205,depthWrite:!1,transparent:!0,side:2}),i=new t(this.geometry,r);i.name=`${o?`Protoplanetary`:`Debris`} disc sheet ${n}`,i.renderOrder=-.01+n*.001,i.frustumCulled=!1,i.onBeforeRender=(e,t,r)=>this.prepareSheet(i,n,r,d,f),this.sheets.push(i),this.object.add(i)}),this.band=o?null:this.createBand(c),this.object.name=o?`Protoplanetary disc`:`Debris disc`,e.add(this.object)}animate(e){this.shared.uTime.value=e;let t=this.data.kind===`protoplanetary`;this.shared.uBrightness.value=t?K.discBrightness:K.debrisBrightness,this.shared.uLightPower.value=K.lightPower,this.shared.uForward.value=t?K.forward:K.debrisForward,this.shared.uMaxLight.value=K.maxLight,this.shared.uTauPower.value=K.tauPower,this.shared.uSlantCap.value=t?K.slantCap:K.debrisSlantCap,this.band&&(this.band.material.uniforms.uBandDepth.value=K.debrisBandDepth),this.shared.uContrast.value=t?K.contrast:0,this.shared.uClumps.value=t?K.clumps:K.clumps*.3,this.shared.uFade.value.set(K.near,K.far)}update(){}createBand(e){let{data:n}=this,r=n.outer*.9,i=n.aspect*n.outer*(r/n.outer)**n.flare,a=new se(r,r,2*Z*i,Q[0],Q[1],!0),o=new t(a,new N({vertexShader:je,fragmentShader:Me,uniforms:{uHeight:{value:i},uHabitable:this.shared.uHabitable,uLightPower:this.shared.uLightPower,uMaxLight:this.shared.uMaxLight,uLightAt:{value:this.shared.uHabitable.value},uStar:this.shared.uStar,uBandDepth:{value:K.debrisBandDepth},uInside:this.shared.uInside,uBrightness:this.shared.uBrightness,uForward:this.shared.uForward,uColor:{value:e},uFade:this.shared.uFade},blending:5,blendSrc:201,blendDst:201,depthWrite:!1,transparent:!0,side:1}));return o.renderOrder=-.02,o.onBeforeRender=(e,t,n)=>this.measureInside(n),o.frustumCulled=!1,o.name=`Debris disc band`,this.object.add(o),o}measureInside(e){this.object.worldToLocal(e.getWorldPosition(this.local));let{data:t}=this,n=Math.hypot(this.local.x,this.local.z),r=Math.min(Math.max(n,t.inner),t.outer),i=t.aspect*t.outer*(r/t.outer)**t.flare,a=1-s.smoothstep(Math.abs(this.local.y)/i,.3,1),o=1-s.smoothstep(n/t.outer,.5,.85);this.shared.uInside.value=a*o}prepareSheet(e,t,n,r,i){this.object.worldToLocal(n.getWorldPosition(this.local)),this.object.getWorldPosition(this.star);let a=this.local.y>=0?t:this.layers.length-1-t,o=this.layers[a],s=e.material.uniforms;s.uLayer.value=o,s.uLayerWeight.value=r[a]/i;let c=Math.abs(o)/this.layers[this.layers.length-1];s.uShade.value=this.data.kind===`protoplanetary`?K.midplane+(1-K.midplane)*c:1}dispose(){this.scene.remove(this.object),this.geometry.dispose(),this.clumpMap.dispose();for(let e of this.sheets)e.material.dispose();this.band?.geometry.dispose(),this.band?.material.dispose()}};function Pe(e,t){let n=9797,r=new Float32Array(n*3),i=new Float32Array(n),a=new Float32Array(n),o=[];for(let n=0;n<=Y;n++){let s=t*(e.outer/t)**(n/Y),c=ue(e,s),l=P(e,s);for(let e=0;e<97;e++){let t=2*Math.PI*e/J,u=n*97+e;r.set([s*Math.cos(t),0,s*Math.sin(t)],u*3),i[u]=c,a[u]=l,e<J&&n<Y&&o.push(u,u+97,u+1,u+1,u+97,u+97+1)}}let s=new j;return s.setAttribute(`position`,new F(r,3)),s.setAttribute(`aBase`,new F(i,1)),s.setAttribute(`aRel`,new F(a,1)),s.setIndex(o),s}function Fe(e){let t=e.folder(`Dust discs`);t?.add(K,`discBrightness`,0,4),t?.add(K,`debrisBrightness`,0,1),t?.add(K,`lightPower`,.2,1),t?.add(K,`forward`,0,.9),t?.add(K,`debrisForward`,0,.9),t?.add(K,`debrisSlantCap`,.02,1),t?.add(K,`maxLight`,.5,6),t?.add(K,`debrisBandDepth`,0,3),t?.add(K,`midplane`,0,1),t?.add(K,`clumps`,0,1),t?.add(K,`tauPower`,.1,1),t?.add(K,`slantCap`,.02,1),t?.add(K,`contrast`,0,2),t?.add(K,`near`,0,300),t?.add(K,`far`,0,1500)}var Ie=10,$=6,Le=class{scene;data;stars;planets;moons=[];comets;nuclei;belts;dust;trails;asteroids=[];small;bodies;anchor;galacticLight;galacticCentre;airLight={value:w.air};ambient;glowTexture;sky;_time=0;speed=1;scratch=new e;constructor(t,r,a,s,u={x:1,y:0,z:0}){this.scene=t,this.data=a,this.glowTexture=p();let m=a.stars.length>1;this.sky=a.stars.some(ce)?new fe:null,this.stars=a.stars.map((e,n)=>new pe(t,r,m?`${a.name} ${`AB`[n]}`:a.name,e,re(a.seed,`star`,n),this.sky));let h=this.stars[0],g=new e(u.x,u.y,u.z).normalize(),_=h?{vector:h.object.position,point:!0}:{vector:g,point:!1,strength:this.airLight};this.galacticCentre=h?null:g,this.galacticLight=h?null:new I(w.color,w.intensity),this.galacticLight&&(this.galacticLight.name=`Galactic light`,this.galacticLight.position.copy(g).multiplyScalar(1e3),t.add(this.galacticLight)),this.planets=a.planets.map(e=>{let n=new k(t,r,{...e,life:A(a,e)},Re(e,a.dust?.kind===`protoplanetary`),e.extent+Ie,_);for(let o of e.moons){let s={...o,life:A(a,e,o)},c=new k(t,r,s,`${i(o.type)} · moon`,o.radius+$,_,n);this.moons.push(c)}return n}),this.comets=a.comets.map(e=>{let n=new k(t,r,ie(e),d(e),e.radius+$,_);return new c(t,e,n,a.habitableRadius,this.glowTexture)}),this.nuclei=this.comets.map(e=>e.nucleus),this.belts=a.belts.map(e=>{let n=e.asteroids.map(n=>new k(t,r,R(n),l(n,e),n.radius+$,_));return this.asteroids.push(...n),new ne(t,e,n)}),this.small=[...this.nuclei,...this.asteroids];let v=a.stars.reduce((e,t)=>e+t.mass,0);this.dust=a.dust?new Ne(t,a.dust,a.stars,a.habitableRadius,o(a.dust.inner,v)):null,this.trails=a.comets.map(e=>new Te(t,e,a.habitableRadius)),this.bodies=[...this.stars,...this.planets,...this.moons,...this.small],this.anchor=this.stars[0]??this.planets[0],this.ambient=new oe(`#9bb8ff`,`#1a1020`,.35),t.add(this.ambient),this.animate(this._time),s&&(this.galacticLight&&le(s),this.sky&&me(s),ae(s),ee(s),te(s),f(s),Fe(s),Ee(s));let y=s?.folder(`Stars`);y?.add(T,`pace`,0,5),y?.add(T,`granulation`,.2,3),y?.add(T,`spots`,0,3),y?.add(T,`limbDarkening`,0,1),y?.add(T,`corona`,0,3),y?.add(T,`intensity`,.5,5),y?.add(T,`rim`,0,3),y?.add(T,`rimWidth`,.02,1),y?.add(T,`glare`,0,2),y?.add(E,`particleSize`,.005,.1),y?.add(E,`brightness`,0,3);let b=s?.folder(`Comets`);b?.add(x,`activeDistance`,.3,3),b?.add(x,`tailLength`,0,300),b?.add(x,`maxTailLength`,0,1e3),b?.add(x,`tailWidth`,0,20),b?.add(x.nearFade,`0`,0,20).name(`nearFade from`),b?.add(x.nearFade,`1`,0,100).name(`nearFade to`),b?.add(x,`dustCurve`,0,1);let S=s?.folder(`Asteroid belts`);S?.add(n,`meshPixels`,1,12),S?.add(n,`minPixels`,0,3),S?.add(n,`dotBrightness`,0,4),S?.add(n,`dustNear`,0,1e3),S?.add(n,`dustFar`,0,3e3),S?.add(n,`dustBrightness`,0,1),S?.add(n,`reselect`,0,2),S?.add(n,`maxMeshes`,0,5e3,50)}get time(){return this._time}fixedUpdate(e){this._time+=e*this.speed;for(let t of this.stars)t.step(this._time,e);for(let t of this.planets)t.step(this._time,e);for(let t of this.moons)t.step(this._time,e);for(let t of this.small)t.step(this._time,e)}setTime(e){this._time=e;for(let t of this.stars)t.jumpTo(e,C);for(let t of this.planets)t.jumpTo(e,C);for(let t of this.moons)t.jumpTo(e,C);for(let t of this.small)t.jumpTo(e,C)}pose(e,t,n){for(let t of this.stars)t.positionAt(e,t.object.position);for(let r of this.planets)this.posePlanet(r,e,t,n);for(let r of this.moons)this.posePlanet(r,e,t,n);for(let r of this.small)this.posePlanet(r,e,t,n);this.animate(e)}unpose(){for(let e of this.planets)e.object.scale.setScalar(1);for(let e of this.moons)e.object.scale.setScalar(1);for(let e of this.small)e.object.scale.setScalar(1)}update(e,t){this.galacticLight&&(this.galacticLight.color.set(w.color),this.galacticLight.intensity=w.intensity,this.airLight.value=w.air);for(let n of this.stars)n.update(e,t);for(let n of this.planets)n.update(e,t);for(let n of this.moons)n.update(e,t);for(let n of this.small)n.update(e,t);let n=this._time-C*this.speed*(1-t);for(let e of this.planets)e.spinAt&&(e.spinAngle=e.spinAt(n));for(let e of this.moons)e.spinAt&&(e.spinAngle=e.spinAt(n));for(let e of this.small)e.spinAt&&(e.spinAngle=e.spinAt(n));this.animate(n)}animate(e){for(let t of this.stars)t.animate(e);for(let t of this.planets)t.animate(e);for(let t of this.moons)t.animate(e);for(let t of this.small)t.animate(e);for(let t of this.comets)t.poseAt(e);for(let t of this.belts)t.animate(e);this.dust?.animate(e);for(let t of this.trails)t.animate(e)}dispose(){for(let e of this.stars)e.dispose();for(let e of this.planets)e.dispose();for(let e of this.moons)e.dispose();for(let e of this.comets)e.dispose();for(let e of this.small)e.dispose();for(let e of this.belts)e.dispose();this.dust?.dispose();for(let e of this.trails)e.dispose();this.scene.remove(this.ambient),this.ambient.dispose(),this.galacticLight&&(this.scene.remove(this.galacticLight),this.galacticLight.dispose()),this.glowTexture.dispose(),this.sky?.dispose()}posePlanet(e,t,n,r){let i=e.positionAt(t,e.object.position);e.object.scale.setScalar(S(e.radius,this.scratch.subVectors(i,n).length(),r))}};function Re(e,t){let n=[L(e.type,e.size)];return t&&n.push(`forming`),e.rings&&n.push(`rings`),e.moons.length>0&&n.push(e.moons.length===1?`1 moon`:`${e.moons.length} moons`),n.join(` · `)}export{ye as n,ge as r,Le as t};