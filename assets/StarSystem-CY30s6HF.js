import{$r as e,$t as t,B as n,Fn as r,H as i,Hn as a,Ir as o,Jn as s,Mt as c,Pn as l,Q as u,R as d,U as ee,V as f,W as p,Xr as m,Z as h,_n as g,a as _,c as v,en as te,hn as y,i as ne,in as re,kt as b,lr as ie,n as ae,o as x,ot as S,pn as oe,st as C,tn as w,vt as se,yn as ce,z as le}from"./FpsCounter-B1JFYIge.js";import{Cn as T,En as E,Ft as D,Gn as O,H as k,It as A,Kn as ue,Ut as j,Xn as M,Yt as de,Zt as fe,_n as pe,ln as me,lr as N,qt as P,sn as F,ur as I,yn as L}from"./groundDepth-Fvx9IZyL.js";import{t as R}from"./atmosphereShell-BPl6ZTyC.js";var z=16,he=56,B=8,ge=class{el=document.getElementById(`tooltip`);nameEl=document.getElementById(`tooltip-name`);infoEl=document.getElementById(`tooltip-info`);detailsEl=document.getElementById(`tooltip-details`);extraEl=document.getElementById(`tooltip-extra`);subject=null;width=0;height=0;claimed=!1;showClaimed(e,...t){this.claimed=!1,this.show(...t),this.claimed=!0,this.setTone(e)}release(){this.claimed&&(this.claimed=!1,this.setTone(null),this.hide())}setTone(e){e?this.el.dataset.tone=e:delete this.el.dataset.tone}show(e,t,n,r,i,a,o=!1,s){if(this.claimed)return;e!==this.subject&&(this.subject=e,this.nameEl.textContent=t,this.infoEl.textContent=n,this.detailsEl.textContent=a??``,this.detailsEl.hidden=!a,this.extraEl.replaceChildren(),s?.(this.extraEl),this.extraEl.hidden=!s,this.el.hidden=!1,this.width=this.el.offsetWidth,this.height=this.el.offsetHeight);let c=o?r-this.width/2:r+z,l=o?i-he-this.height:i+z;c=Math.max(B,Math.min(c,window.innerWidth-this.width-B)),l=Math.max(B,Math.min(l,window.innerHeight-this.height-B)),this.el.style.transform=`translate(${c}px, ${l}px)`}hide(){this.claimed||this.subject===null||(this.subject=null,this.el.hidden=!0)}},V={length:.35,opacity:.35,highlight:.7,moonOpacity:.3,headWidth:1.2,tailWidth:4,minPixels:3,nearFade:40,endOn:.5,moonRange:5},H=128,U=10,_e=`#b4c2de`,ve=.35,ye=class{scene;camera;highlighted;root=new F;geometry=W(H);planetTrails;moonTrails;shared={time:{value:0},minWidth:{value:0},nearFade:{value:V.nearFade},endOn:{value:V.endOn},span:{value:V.length*Math.PI*2}};scratch=new I;constructor(e,t,n,r,i,a){this.scene=e,this.camera=t,this.highlighted=i,this.root.name=`Orbit trails`,this.planetTrails=n.map(e=>this.createTrail(e)),this.moonTrails=r.map(e=>this.createTrail(e)),e.add(this.root);let o=a.folder(`Orbit trails`);o?.add(V,`length`,.05,1),o?.add(V,`opacity`,0,1),o?.add(V,`highlight`,0,1),o?.add(V,`moonOpacity`,0,1),o?.add(V,`headWidth`,.1,4),o?.add(V,`tailWidth`,.1,10),o?.add(V,`minPixels`,0,10),o?.add(V,`nearFade`,0,200),o?.add(V,`endOn`,0,1),o?.add(V,`moonRange`,1,20),o?.add(this.root,`visible`).name(`show`)}set visible(e){this.root.visible=e}get visible(){return this.root.visible}get visibleCount(){let e=0;for(let t of[...this.planetTrails,...this.moonTrails])t.mesh.visible&&e++;return e}get count(){return this.planetTrails.length+this.moonTrails.length}update(e){let t=V,n=this.shared;n.time.value+=e,n.nearFade.value=t.nearFade,n.endOn.value=t.endOn,n.span.value=t.length*Math.PI*2,n.minWidth.value=t.minPixels*2*Math.tan(T.degToRad(this.camera.fov)/2)/innerHeight;let r=1-Math.exp(-8*e);for(let e of this.planetTrails)this.place(e,e.body.renderPosition),this.ease(e,this.highlighted(e.body)?t.highlight:t.opacity,r);for(let e of this.moonTrails){let n=e.body.parent;e.mesh.position.copy(n.renderPosition),this.place(e,this.scratch.subVectors(e.body.renderPosition,n.renderPosition));let i=n.standoff*t.moonRange,a=this.camera.position.distanceTo(n.renderPosition),o=1-T.smoothstep(a,i,i*2);this.ease(e,this.highlighted(e.body)?t.highlight:t.moonOpacity*o,r)}}dispose(){this.scene.remove(this.root),this.geometry.dispose();for(let{mesh:e}of[...this.planetTrails,...this.moonTrails])e.material.dispose()}place(e,t){let n=e.mesh.material.uniforms;n.angle.value=g(e.body.config.orbit,t),n.headWidth.value=e.body.radius*V.headWidth,n.tailWidth.value=e.body.radius*V.tailWidth}ease(e,t,n){e.opacity+=(t-e.opacity)*n,e.mesh.material.uniforms.opacity.value=e.opacity,e.mesh.visible=e.opacity>.003}createTrail(e){let{config:t}=e,n=t.atmosphere??(C(t)?t.bands[t.bands.length>>1]:t.style.high),r=Math.max(e.radius,t.rings?.outer??0),i=new M({uniforms:{...this.shared,color:{value:new j(_e).lerp(new j(n),ve)},opacity:{value:0},angle:{value:0},radius:{value:t.orbit.radius},inclination:{value:t.orbit.inclination},node:{value:t.orbit.node??0},headWidth:{value:1},tailWidth:{value:1},body:{value:e.renderPosition},reach:{value:r},seed:{value:t.seed%1e3*.37}},vertexShader:be,fragmentShader:xe,side:2,blending:2,transparent:!0,depthWrite:!1}),a=new E(this.geometry,i);return a.name=`${e.name} trail`,a.frustumCulled=!1,a.visible=!1,this.root.add(a),{body:e,mesh:a,opacity:0}}};function W(e){let t=new Float32Array((e+1)*2*2),n=[];for(let r=0;r<=e;r++){let i=r/e;if(t.set([i,-1,i,1],r*4),r<e){let e=r*2;n.push(e,e+1,e+2,e+1,e+3,e+2)}}let r=new A;return r.setAttribute(`trail`,new D(t,2)),r.setAttribute(`position`,new D(new Float32Array((e+1)*2*3),3)),r.setIndex(n),r}var be=`
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
    vSteady = smoothstep(${Math.cos(T.degToRad(U)).toFixed(4)}, ${Math.cos(T.degToRad(U/3)).toFixed(4)}, turn);
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
  }`,xe=`
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
  ${e}

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
  }`,G={stream:.015,fresh:.35,reach:.1,nearFade:60},K=720,Se=`
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
`,Ce=`
  uniform vec3 uColor;
  varying float vBrightness;
  void main() {
    gl_FragColor = vec4(uColor * vBrightness, 1.0);
    #include <colorspace_fragment>
  }
`,we=class{scene;data;line;uniforms;constructor(e,t,n){this.scene=e,this.data=t;let{orbit:r}=t,i=new Float32Array(K*3),a=new Float32Array(K),o=new I,s={...r,phase:0};for(let e=0;e<K;e++){let t=2*Math.PI*e/K,n=t-r.eccentricity*Math.sin(t);y(s,n/(2*Math.PI)*r.period,o),i.set([o.x,o.y,o.z],e*3),a[e]=n}let c=new A;c.setAttribute(`position`,new D(i,3)),c.setAttribute(`aAnomaly`,new D(a,1)),this.uniforms={uComet:{value:0},uHabitable:{value:n},uStream:{value:G.stream},uFresh:{value:G.fresh},uReach:{value:G.reach},uNearFade:{value:G.nearFade},uColor:{value:new j(t.dustColor)}},this.line=new pe(c,new M({vertexShader:Se,fragmentShader:Ce,uniforms:this.uniforms,blending:2,depthWrite:!1,transparent:!0})),this.line.name=`${t.name} dust trail`,this.line.frustumCulled=!1,e.add(this.line)}animate(e){let{orbit:t}=this.data,n=this.uniforms;n.uComet.value=t.phase+2*Math.PI*e/t.period,n.uStream.value=G.stream,n.uFresh.value=G.fresh,n.uReach.value=G.reach,n.uNearFade.value=G.nearFade}update(){}dispose(){this.scene.remove(this.line),this.line.geometry.dispose(),this.line.material.dispose()}};function Te(e){let t=e.folder(`Comet dust trails`);t?.add(G,`stream`,0,.5),t?.add(G,`fresh`,0,2),t?.add(G,`reach`,.005,.3),t?.add(G,`nearFade`,0,300)}function Ee(e,t,n){let r=new Uint8Array(t*n),i=e%1e3/97;for(let e=0;e<n;e++){let a=(e+.5)/n;for(let n=0;n<t;n++){let o=2*Math.PI*(n+.5)/t,s=f(Math.cos(o)*3,Math.sin(o)*3,a*5+i,3),c=f(Math.cos(o)*11,Math.sin(o)*11,a*19+i*1.7,2),l=.45+1.1*s*(.6+.8*c);r[e*t+n]=Math.round(255*Math.min(2,l)/2)}}return r}var q={discBrightness:1.1,debrisBrightness:.15,lightPower:.35,forward:.45,debrisForward:.3,debrisSlantCap:.4,maxLight:2,midplane:.3,tauPower:.5,slantCap:.15,contrast:.6,debrisBandDepth:.6,clumps:.55,near:30,far:260},De=[-.7,0,.7],Oe=[-.5,0,.5],J=[512,128],Y=96,X=100,ke=`
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
`,Ne=class{scene;data;object=new F;geometry;sheets=[];shared;clumpMap;layers;band;local=new I;star=new I;constructor(e,n,r,i,a){this.scene=e,this.data=n;let o=n.kind===`protoplanetary`,s=new j(r[0]?t(r[0]):`#ffffff`),c=new j(n.color).multiply(s);this.clumpMap=new de(Ee(n.seed,...J),...J,O),this.clumpMap.wrapS=ue,this.clumpMap.magFilter=this.clumpMap.minFilter=L,this.clumpMap.needsUpdate=!0;let l=n.inner*.98;this.shared={uClumpMap:{value:this.clumpMap},uInner:{value:l},uLogSpan:{value:Math.log(n.outer/l)},uTaper:{value:n.taper},uOuter:{value:n.outer},uAspect:{value:n.aspect},uFlare:{value:n.flare},uWobble:{value:o?0:.1},uSpiral:{value:new N(n.spiral,n.pitch)},uClumps:{value:o?q.clumps:q.clumps*.3},uTime:{value:0},uOmega:{value:2*Math.PI/a},uDepth:{value:n.depth},uTauPower:{value:q.tauPower},uSlantCap:{value:o?q.slantCap:q.debrisSlantCap},uContrast:{value:o?q.contrast:0},uOpaque:{value:+!!o},uGrazeFade:{value:+!o},uInside:{value:0},uBrightness:{value:1},uHabitable:{value:i},uLightPower:{value:q.lightPower},uMaxLight:{value:q.maxLight},uForward:{value:o?q.forward:q.debrisForward},uColor:{value:c},uStar:{value:this.star},uFade:{value:new N(q.near,q.far)}},this.geometry=Pe(n,l),this.layers=o?Oe:De;let u=this.layers.map(e=>Math.exp(-(e*e)/2)),d=u.reduce((e,t)=>e+t,0);this.layers.forEach((e,t)=>{let n=new M({vertexShader:ke,fragmentShader:Ae,uniforms:{...this.shared,uLayer:{value:0},uLayerWeight:{value:0},uShade:{value:1}},blending:5,blendSrc:201,blendDst:205,depthWrite:!1,transparent:!0,side:2}),r=new E(this.geometry,n);r.name=`${o?`Protoplanetary`:`Debris`} disc sheet ${t}`,r.renderOrder=-.01+t*.001,r.frustumCulled=!1,r.onBeforeRender=(e,n,i)=>this.prepareSheet(r,t,i,u,d),this.sheets.push(r),this.object.add(r)}),this.band=o?null:this.createBand(c),this.object.name=o?`Protoplanetary disc`:`Debris disc`,e.add(this.object)}animate(e){this.shared.uTime.value=e;let t=this.data.kind===`protoplanetary`;this.shared.uBrightness.value=t?q.discBrightness:q.debrisBrightness,this.shared.uLightPower.value=q.lightPower,this.shared.uForward.value=t?q.forward:q.debrisForward,this.shared.uMaxLight.value=q.maxLight,this.shared.uTauPower.value=q.tauPower,this.shared.uSlantCap.value=t?q.slantCap:q.debrisSlantCap,this.band&&(this.band.material.uniforms.uBandDepth.value=q.debrisBandDepth),this.shared.uContrast.value=t?q.contrast:0,this.shared.uClumps.value=t?q.clumps:q.clumps*.3,this.shared.uFade.value.set(q.near,q.far)}update(){}createBand(e){let{data:t}=this,n=t.outer*.9,r=t.aspect*t.outer*(n/t.outer)**t.flare,i=new P(n,n,2*Z*r,Q[0],Q[1],!0),a=new E(i,new M({vertexShader:je,fragmentShader:Me,uniforms:{uHeight:{value:r},uHabitable:this.shared.uHabitable,uLightPower:this.shared.uLightPower,uMaxLight:this.shared.uMaxLight,uLightAt:{value:this.shared.uHabitable.value},uStar:this.shared.uStar,uBandDepth:{value:q.debrisBandDepth},uInside:this.shared.uInside,uBrightness:this.shared.uBrightness,uForward:this.shared.uForward,uColor:{value:e},uFade:this.shared.uFade},blending:5,blendSrc:201,blendDst:201,depthWrite:!1,transparent:!0,side:1}));return a.renderOrder=-.02,a.onBeforeRender=(e,t,n)=>this.measureInside(n),a.frustumCulled=!1,a.name=`Debris disc band`,this.object.add(a),a}measureInside(e){this.object.worldToLocal(e.getWorldPosition(this.local));let{data:t}=this,n=Math.hypot(this.local.x,this.local.z),r=Math.min(Math.max(n,t.inner),t.outer),i=t.aspect*t.outer*(r/t.outer)**t.flare,a=1-T.smoothstep(Math.abs(this.local.y)/i,.3,1),o=1-T.smoothstep(n/t.outer,.5,.85);this.shared.uInside.value=a*o}prepareSheet(e,t,n,r,i){this.object.worldToLocal(n.getWorldPosition(this.local)),this.object.getWorldPosition(this.star);let a=this.local.y>=0?t:this.layers.length-1-t,o=this.layers[a],s=e.material.uniforms;s.uLayer.value=o,s.uLayerWeight.value=r[a]/i;let c=Math.abs(o)/this.layers[this.layers.length-1];s.uShade.value=this.data.kind===`protoplanetary`?q.midplane+(1-q.midplane)*c:1}dispose(){this.scene.remove(this.object),this.geometry.dispose(),this.clumpMap.dispose();for(let e of this.sheets)e.material.dispose();this.band?.geometry.dispose(),this.band?.material.dispose()}};function Pe(e,t){let n=9797,i=new Float32Array(n*3),a=new Float32Array(n),o=new Float32Array(n),s=[];for(let n=0;n<=X;n++){let c=t*(e.outer/t)**(n/X),u=r(e,c),d=l(e,c);for(let e=0;e<97;e++){let t=2*Math.PI*e/Y,r=n*97+e;i.set([c*Math.cos(t),0,c*Math.sin(t)],r*3),a[r]=u,o[r]=d,e<Y&&n<X&&s.push(r,r+97,r+1,r+1,r+97,r+97+1)}}let c=new A;return c.setAttribute(`position`,new D(i,3)),c.setAttribute(`aBase`,new D(a,1)),c.setAttribute(`aRel`,new D(o,1)),c.setIndex(s),c}function Fe(e){let t=e.folder(`Dust discs`);t?.add(q,`discBrightness`,0,4),t?.add(q,`debrisBrightness`,0,1),t?.add(q,`lightPower`,.2,1),t?.add(q,`forward`,0,.9),t?.add(q,`debrisForward`,0,.9),t?.add(q,`debrisSlantCap`,.02,1),t?.add(q,`maxLight`,.5,6),t?.add(q,`debrisBandDepth`,0,3),t?.add(q,`midplane`,0,1),t?.add(q,`clumps`,0,1),t?.add(q,`tauPower`,.1,1),t?.add(q,`slantCap`,.02,1),t?.add(q,`contrast`,0,2),t?.add(q,`near`,0,300),t?.add(q,`far`,0,1500)}var Ie=10,$=6,Le=class{scene;data;stars;planets;moons=[];comets;nuclei;belts;dust;trails;asteroids=[];small;bodies;anchor;galacticLight;galacticCentre;airLight={value:_.air};ambient;glowTexture;sky;_time=0;speed=1;scratch=new I;constructor(e,t,r,s,l={x:1,y:0,z:0}){this.scene=e,this.data=r,this.glowTexture=se();let f=r.stars.length>1;this.sky=r.stars.some(a)?new ae:null,this.stars=r.stars.map((n,i)=>new x(e,t,f?`${r.name} ${`AB`[i]}`:r.name,n,k(r.seed,`star`,i),this.sky));let m=this.stars[0],g=new I(l.x,l.y,l.z).normalize(),y=m?{vector:m.object.position,point:!0}:{vector:g,point:!1,strength:this.airLight};this.galacticCentre=m?null:g,this.galacticLight=m?null:new fe(_.color,_.intensity),this.galacticLight&&(this.galacticLight.name=`Galactic light`,this.galacticLight.position.copy(g).multiplyScalar(1e3),e.add(this.galacticLight)),this.planets=r.planets.map(n=>{let i=new S(e,t,{...n,life:c(r,n)},Re(n,r.dust?.kind===`protoplanetary`),n.extent+Ie,y);for(let a of n.moons){let o={...a,life:c(r,n,a)},s=new S(e,t,o,`${te(a.type)} · moon`,a.radius+$,y,i);this.moons.push(s)}return i}),this.comets=r.comets.map(n=>{let a=new S(e,t,ee(n),oe(n),n.radius+$,y);return new i(e,n,a,r.habitableRadius,this.glowTexture)}),this.nuclei=this.comets.map(e=>e.nucleus),this.belts=r.belts.map(n=>{let r=n.asteroids.map(r=>new S(e,t,le(r),ce(r,n),r.radius+$,y));return this.asteroids.push(...r),new d(e,n,r)}),this.small=[...this.nuclei,...this.asteroids];let C=r.stars.reduce((e,t)=>e+t.mass,0);this.dust=r.dust?new Ne(e,r.dust,r.stars,r.habitableRadius,re(r.dust.inner,C)):null,this.trails=r.comets.map(t=>new we(e,t,r.habitableRadius)),this.bodies=[...this.stars,...this.planets,...this.moons,...this.small],this.anchor=this.stars[0]??this.planets[0],this.ambient=new me(`#9bb8ff`,`#1a1020`,.35),e.add(this.ambient),this.animate(this._time),s&&(this.galacticLight&&ne(s),this.sky&&u(s),R(s),b(s),o(s),ie(s),Fe(s),Te(s));let w=s?.folder(`Stars`);w?.add(h,`pace`,0,5),w?.add(h,`granulation`,.2,3),w?.add(h,`spots`,0,3),w?.add(h,`limbDarkening`,0,1),w?.add(h,`corona`,0,3),w?.add(h,`intensity`,.5,5),w?.add(h,`rim`,0,3),w?.add(h,`rimWidth`,.02,1),w?.add(h,`glare`,0,2),w?.add(v,`particleSize`,.005,.1),w?.add(v,`brightness`,0,3);let T=s?.folder(`Comets`);T?.add(p,`activeDistance`,.3,3),T?.add(p,`tailLength`,0,300),T?.add(p,`maxTailLength`,0,1e3),T?.add(p,`tailWidth`,0,20),T?.add(p.nearFade,`0`,0,20).name(`nearFade from`),T?.add(p.nearFade,`1`,0,100).name(`nearFade to`),T?.add(p,`dustCurve`,0,1);let E=s?.folder(`Asteroid belts`);E?.add(n,`meshPixels`,1,12),E?.add(n,`minPixels`,0,3),E?.add(n,`dotBrightness`,0,4),E?.add(n,`dustNear`,0,1e3),E?.add(n,`dustFar`,0,3e3),E?.add(n,`dustBrightness`,0,1),E?.add(n,`reselect`,0,2),E?.add(n,`maxMeshes`,0,5e3,50)}get time(){return this._time}fixedUpdate(e){this._time+=e*this.speed;for(let t of this.stars)t.step(this._time,e);for(let t of this.planets)t.step(this._time,e);for(let t of this.moons)t.step(this._time,e);for(let t of this.small)t.step(this._time,e)}setTime(e){this._time=e;for(let t of this.stars)t.jumpTo(e,s);for(let t of this.planets)t.jumpTo(e,s);for(let t of this.moons)t.jumpTo(e,s);for(let t of this.small)t.jumpTo(e,s)}pose(e,t,n){for(let t of this.stars)t.positionAt(e,t.object.position);for(let r of this.planets)this.posePlanet(r,e,t,n);for(let r of this.moons)this.posePlanet(r,e,t,n);for(let r of this.small)this.posePlanet(r,e,t,n);this.animate(e)}unpose(){for(let e of this.planets)e.object.scale.setScalar(1);for(let e of this.moons)e.object.scale.setScalar(1);for(let e of this.small)e.object.scale.setScalar(1)}update(e,t){this.galacticLight&&(this.galacticLight.color.set(_.color),this.galacticLight.intensity=_.intensity,this.airLight.value=_.air);for(let n of this.stars)n.update(e,t);for(let n of this.planets)n.update(e,t);for(let n of this.moons)n.update(e,t);for(let n of this.small)n.update(e,t);let n=this._time-s*this.speed*(1-t);for(let e of this.planets)e.spinAt&&(e.spinAngle=e.spinAt(n));for(let e of this.moons)e.spinAt&&(e.spinAngle=e.spinAt(n));for(let e of this.small)e.spinAt&&(e.spinAngle=e.spinAt(n));this.animate(n)}animate(e){for(let t of this.stars)t.animate(e);for(let t of this.planets)t.animate(e);for(let t of this.moons)t.animate(e);for(let t of this.small)t.animate(e);for(let t of this.comets)t.poseAt(e);for(let t of this.belts)t.animate(e);this.dust?.animate(e);for(let t of this.trails)t.animate(e)}dispose(){for(let e of this.stars)e.dispose();for(let e of this.planets)e.dispose();for(let e of this.moons)e.dispose();for(let e of this.comets)e.dispose();for(let e of this.small)e.dispose();for(let e of this.belts)e.dispose();this.dust?.dispose();for(let e of this.trails)e.dispose();this.scene.remove(this.ambient),this.ambient.dispose(),this.galacticLight&&(this.scene.remove(this.galacticLight),this.galacticLight.dispose()),this.glowTexture.dispose(),this.sky?.dispose()}posePlanet(e,t,n,r){let i=e.positionAt(t,e.object.position);e.object.scale.setScalar(m(e.radius,this.scratch.subVectors(i,n).length(),r))}};function Re(e,t){let n=[w(e.type,e.size)];return t&&n.push(`forming`),e.rings&&n.push(`rings`),e.moons.length>0&&n.push(e.moons.length===1?`1 moon`:`${e.moons.length} moons`),n.join(` · `)}export{ye as n,ge as r,Le as t};