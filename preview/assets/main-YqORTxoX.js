import{$n as e,$r as t,$t as n,Ar as r,At as i,Bn as a,Br as o,Bt as s,C as c,Ci as l,Cr as u,Ct as d,D as f,Dn as p,Dr as m,Dt as h,En as g,Er as _,Et as v,F as y,Fn as b,Ft as x,Gn as ee,Gr as te,Gt as ne,Ht as re,In as ie,It as ae,Jr as oe,Jt as se,Kn as ce,Kr as le,Kt as ue,Ln as de,Lr as S,Lt as fe,Mn as pe,Mt as me,Nn as he,Nr as C,Nt as ge,On as _e,Or as ve,Ot as ye,Pn as be,Pr as w,Pt as xe,Qn as Se,Qt as Ce,Rn as we,Rr as Te,Rt as T,Si as Ee,Sr as De,St as Oe,T as ke,Tn as Ae,Tr as je,Tt as Me,Un as Ne,Ur as E,Ut as Pe,Vn as Fe,Vr as Ie,Vt as Le,Wn as Re,Wr as ze,Wt as Be,Xt as Ve,Zn as He,Zr as Ue,Zt as We,_i as Ge,_n as Ke,_r as qe,_t as Je,a as Ye,ar as Xe,bi as D,br as Ze,bt as Qe,ci as $e,cn as et,cr as tt,di as nt,dn as rt,dr as it,dt as O,ei as k,er as at,f as ot,fi as st,fr as ct,ft as lt,gi as A,gn as ut,gr as dt,gt as ft,hi as pt,hr as mt,ht as j,i as ht,ii as gt,in as _t,jn as vt,jt as yt,k as bt,kn as xt,kt as St,lr as Ct,lt as wt,mi as Tt,mr as Et,mt as Dt,n as Ot,ni as M,nn as kt,o as At,oi as jt,or as Mt,pi as Nt,pr as Pt,pt as Ft,qn as It,qr as N,qt as Lt,ri as P,rr as Rt,s as zt,si as Bt,sr as Vt,t as Ht,ti as Ut,u as Wt,ui as F,ur as Gt,ut as Kt,vn as qt,vr as Jt,vt as Yt,w as I,wn as Xt,wr as Zt,wt as Qt,xi as L,xr as R,xt as $t,yn as z,yr as en,yt as tn,zn as nn,zr as rn,zt as an}from"./FpsCounter-B5ENCGz4.js";import{i as on,r as sn,t as cn}from"./GraphicsSettings-Cdjda4vl.js";var ln=16,un=56,dn=8,fn=class{el=document.getElementById(`tooltip`);nameEl=document.getElementById(`tooltip-name`);infoEl=document.getElementById(`tooltip-info`);detailsEl=document.getElementById(`tooltip-details`);extraEl=document.getElementById(`tooltip-extra`);subject=null;width=0;height=0;claimed=!1;showClaimed(e,...t){this.claimed=!1,this.show(...t),this.claimed=!0,this.setTone(e)}release(){this.claimed&&(this.claimed=!1,this.setTone(null),this.hide())}setTone(e){e?this.el.dataset.tone=e:delete this.el.dataset.tone}show(e,t,n,r,i,a,o=!1,s){if(this.claimed)return;e!==this.subject&&(this.subject=e,this.nameEl.textContent=t,this.infoEl.textContent=n,this.detailsEl.textContent=a??``,this.detailsEl.hidden=!a,this.extraEl.replaceChildren(),s?.(this.extraEl),this.extraEl.hidden=!s,this.el.hidden=!1,this.width=this.el.offsetWidth,this.height=this.el.offsetHeight);let c=o?r-this.width/2:r+ln,l=o?i-un-this.height:i+ln;c=Math.max(dn,Math.min(c,window.innerWidth-this.width-dn)),l=Math.max(dn,Math.min(l,window.innerHeight-this.height-dn)),this.el.style.transform=`translate(${c}px, ${l}px)`}hide(){this.claimed||this.subject===null||(this.subject=null,this.el.hidden=!0)}},B={start:.55,minStart:1.8,flightTime:3.5,shipElevation:[1*Math.PI/180,4*Math.PI/180],cameraElevation:[20*Math.PI/180,75*Math.PI/180],starElevation:20*Math.PI/180,bodyBelowCentre:16*Math.PI/180},pn={pastHandover:1.3,reach:2.2,maxDistance:1200},mn={maxLatitude:30*Math.PI/180};function hn(e,t,n){let r=e*Math.sin(n)/Math.max(t,1e-9);return r>=1?0:Math.max(0,Math.acos(r)-n)}function gn(e,t,n,r){let i=Math.hypot(e.x,e.z),a=i>1e-9?e.x/i:0,o=i>1e-9?e.z/i:1,s=Math.min(n,Math.max(t,Math.atan2(e.y,i))),c=Math.cos(s);return r.x=a*c,r.y=Math.sin(s),r.z=o*c,r}var _n=[.0024,.018],vn=[.07,.13],yn=[[`spiral`,45],[`elliptical`,25],[`edgeOn`,18],[`irregular`,12]];function bn(e,t=200){let n=new Ze(R(e,`distantGalaxies`)),r=n.int(1,2),i=[];for(let e=0;e<t;e++){let t=n.fork(`galaxy`,e),a=e<r,o=a?t.weighted([[`spiral`,3],[`edgeOn`,1]]):t.weighted(yn),[s,c]=a?vn:_n,l=s*(c/s)**+(a?t.next():t.next()**2);i.push({direction:Sn(t),kind:o,size:l,tilt:o===`edgeOn`?t.range(1.4,1.54):o===`spiral`?t.range(0,1.15):t.range(0,1.05),rotation:t.range(0,Math.PI*2),arms:t.int(2,3),winding:t.range(1.2,2.6)*t.sign(),color:xn(t,o),brightness:(a?t.range(.7,.9):t.range(.45,1))*(o===`elliptical`?.8:1),seed:t.range(0,100)})}return i}function xn(e,t){switch(t){case`elliptical`:return u(e.range(28,45),e.range(.35,.6),e.range(.68,.78));case`irregular`:return u(e.range(200,250),e.range(.35,.6),e.range(.7,.8));default:return u(e.range(205,235),e.range(.3,.55),e.range(.72,.82))}}function Sn(e){let t=e.range(-1,1),n=e.range(0,Math.PI*2),r=Math.sqrt(1-t*t);return{x:r*Math.cos(n),y:t,z:r*Math.sin(n)}}var Cn=9e3,wn={spiral:0,elliptical:1,edgeOn:2,irregular:3},Tn={intensity:.8},En=class{scene;mesh;constructor(e,t,n){this.scene=e;let r=t.length,i=new Float32Array(r*3),a=new Float32Array(r*4),o=new Float32Array(r*4),s=new Float32Array(r*3),c=new S;t.forEach((e,t)=>{i.set([e.direction.x,e.direction.y,e.direction.z],t*3),a.set([wn[e.kind],e.size,e.rotation,Math.cos(e.tilt)],t*4),o.set([e.arms,e.winding,e.brightness,e.seed],t*4),c.set(e.color).toArray(s,t*3)});let l=new Bt(2,2),u=new oe;u.index=l.index,u.setAttribute(`position`,l.getAttribute(`position`)),u.setAttribute(`dir`,new N(i,3)),u.setAttribute(`shape`,new N(a,4)),u.setAttribute(`look`,new N(o,4)),u.setAttribute(`tint`,new N(s,3)),u.instanceCount=r;let d=new A({uniforms:{intensity:{value:Tn.intensity}},vertexShader:`
        attribute vec3 dir;
        attribute vec4 shape;   // kind, angular radius, position angle, cos(tilt)
        attribute vec4 look;    // arms, winding, brightness, seed
        attribute vec3 tint;
        varying vec2 vUv;
        varying float vKind;
        varying float vCosTilt;
        varying vec4 vLook;
        varying vec3 vTint;
        void main() {
          vec3 d = normalize(dir);
          vec3 ref = abs(d.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
          vec3 right = normalize(cross(ref, d));
          // Wound so the quad faces the camera (its normal, right × up, is -d).
          vec3 up = cross(right, d);
          float c = cos(shape.z);
          float s = sin(shape.z);
          vec2 q = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
          vec3 world = cameraPosition + (d + (right * q.x + up * q.y) * tan(shape.y)) * ${Cn.toFixed(1)};
          vUv = position.xy;
          vKind = shape.x;
          vCosTilt = shape.w;
          vLook = look;
          vTint = tint;
          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }`,fragmentShader:`
        uniform float intensity;
        varying vec2 vUv;
        varying float vKind;
        varying float vCosTilt;
        varying vec4 vLook;
        varying vec3 vTint;

        float hash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float fbm(vec2 p) {
          return 0.5 * noise(p) + 0.3 * noise(p * 2.03 + 7.1) + 0.2 * noise(p * 4.01 + 3.7);
        }

        const vec3 BULGE = vec3(1.0, 0.86, 0.62);

        void main() {
          vec2 p = vUv;
          float seed = vLook.w;
          float b = 0.0;
          vec3 col = vTint;
          if (vKind < 0.5) {
            // Spiral: deproject the tilted disc, then log-spiral arms (theta + winding·ln r = const).
            vec2 q = vec2(p.x, p.y / max(vCosTilt, 0.12));
            float r = length(q);
            float th = atan(q.y, q.x);
            float arms = pow(0.5 + 0.5 * cos(vLook.x * (th - vLook.y * log(r + 0.03))), 2.5);
            float clumps = 0.55 + 0.9 * fbm(q * 5.0 + seed);
            float disc = exp(-r * 4.5) * (0.2 + 1.1 * arms * clumps);
            float bulge = exp(-r * r * 90.0);
            b = disc + 1.3 * bulge;
            col = mix(vTint, BULGE, clamp(bulge * 1.3 / max(b, 1e-4), 0.0, 1.0));
          } else if (vKind < 1.5) {
            // Elliptical: a smooth, Sérsic-like (n = 2) blob, squashed by the tilt.
            vec2 q = vec2(p.x, p.y / max(vCosTilt, 0.45));
            b = exp(-3.67 * sqrt(length(q) / 0.28));
          } else if (vKind < 2.5) {
            // Edge-on disc: thin and long, a bulge, and a dark dust lane just off the midplane.
            float h = 0.045 + 0.25 * vCosTilt;
            float disc = exp(-abs(p.x) * 3.8) * exp(-abs(p.y) / h) * (0.8 + 0.4 * fbm(vec2(p.x * 8.0, p.y * 3.0) + seed));
            float bulge = exp(-(p.x * p.x + p.y * p.y * 2.5) * 45.0);
            float lane = 1.0 - 0.8 * exp(-pow((p.y - 0.25 * h) / (0.4 * h), 2.0)) * smoothstep(0.85, 0.05, abs(p.x));
            b = (disc + 1.2 * bulge) * lane;
            col = mix(vTint, BULGE, clamp(bulge * 1.2 / max(disc + 1.2 * bulge, 1e-4), 0.0, 1.0));
          } else {
            // Irregular: clumpy, lopsided star-forming knots.
            vec2 q = vec2(p.x, p.y / max(vCosTilt, 0.4)) + (vec2(noise(p * 2.0 + seed), noise(p * 2.0 - seed)) - 0.5) * 0.35;
            float r = length(q);
            float knots = pow(fbm(q * 6.0 + seed * 1.7), 3.0) * 4.0;
            b = exp(-r * r * 6.0) * (0.15 + knots);
          }
          // Soft edge, so the quad never shows.
          b *= smoothstep(1.0, 0.75, length(p));
          gl_FragColor = vec4(col * b * vLook.z * intensity, 1.0);
          #include <colorspace_fragment>
        }`,blending:2,transparent:!0,depthWrite:!1});this.mesh=new P(u,d),this.mesh.frustumCulled=!1,this.mesh.renderOrder=-2,e.add(this.mesh),n.folder(`Distant galaxies`)?.add(Tn,`intensity`,0,2)}get count(){return this.mesh.geometry.instanceCount}update(){this.mesh.material.uniforms.intensity.value=Tn.intensity}dispose(){this.scene.remove(this.mesh),this.mesh.geometry.dispose(),this.mesh.material.dispose()}},V=4.5,Dn=1.8,On=`
  // Abramowitz & Stegun 7.1.26, |error| < 1.5e-7.
  float erfc_(float x) {
    float z = abs(x);
    float t = 1.0 / (1.0 + 0.3275911 * z);
    float y = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    float r = y * exp(-z * z);
    return x >= 0.0 ? r : 2.0 - r;
  }

  float gaussianPath(vec3 o, vec3 d, float k, float near) {
    float a = dot(d, d);
    float m = dot(o, d) / a;                      // t of closest approach is -m
    float perp2 = max(dot(o, o) - m * m * a, 0.0);
    float ka = k * a;
    return exp(-k * perp2) * 0.886226925 / sqrt(ka) * erfc_(sqrt(ka) * (m + near));
  }
`;function kn(e,t,n){let r=e*Math.sqrt(Math.PI/V);return-Math.log(1-t/n)/r}function An(e,t,n,r,i){let a=kn(e.y,n,r),o=new A({uniforms:{radii:{value:e.clone()},color:{value:new S(t)},density:{value:a},maxBrightness:{value:r},near:{value:i}},vertexShader:`
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,fragmentShader:`
      uniform vec3 radii;
      uniform vec3 color;
      uniform float density;
      uniform float maxBrightness;
      uniform float near;
      varying vec3 vWorld;
      ${On}

      void main() {
        // Ray from the camera in the ellipsoid's unit space; t stays in world units.
        vec3 o = cameraPosition / radii;
        vec3 d = normalize(vWorld - cameraPosition) / radii;
        // The ray from 'near' in front of the camera onwards.
        float path = gaussianPath(o, d, ${V.toFixed(1)}, near);
        gl_FragColor = vec4(color * maxBrightness * (1.0 - exp(-density * path)), 1.0);
        #include <colorspace_fragment>
      }`,side:1,blending:2,transparent:!0,depthWrite:!1}),s=new P(new Ge(1,48,24),o);return s.scale.copy(e).multiplyScalar(Dn),s}var jn=.04,Mn=2,Nn=150,Pn=350,Fn=[.08,.4],In=1.15,Ln=class{parent;mesh;cameraLocal=new L;inverse=new M;constructor(e,t,n){this.parent=e;let r=t.length,i=new Float32Array(r*3),a=new Float32Array(r*3),o=new Float32Array(r),s=new Float32Array(r*3),c=new S;t.forEach((e,t)=>{i.set([e.position.x,e.position.y,e.position.z],t*3),a.set([e.length/2,e.thickness/2,e.width/2],t*3),o[t]=e.angle;let r=Math.hypot(e.position.x,e.position.z)/n,l=k.smoothstep(r,Fn[0],Fn[1]);c.set(e.color).multiplyScalar(.15+.85*l).toArray(s,t*3)});let l=new le(1,1),u=new oe;u.setAttribute(`position`,l.getAttribute(`position`)),u.setAttribute(`center`,new N(i,3)),u.setAttribute(`radii`,new N(a,3)),u.setAttribute(`angle`,new N(o,1)),u.setAttribute(`cloudColor`,new N(s,3)),u.instanceCount=r;let d=new A({uniforms:{cameraLocal:{value:this.cameraLocal}},vertexShader:`
        uniform vec3 cameraLocal;
        attribute vec3 center;
        attribute vec3 radii;
        attribute float angle;
        attribute vec3 cloudColor;
        varying vec3 vLocal;
        varying vec3 vCenter;
        varying vec3 vRadii;
        varying vec2 vRot;
        varying vec3 vColor;
        void main() {
          float fade = smoothstep(${Nn.toFixed(1)}, ${Pn.toFixed(1)}, distance(center, cameraLocal));
          if (fade <= 0.0) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // outside the clip volume: nothing drawn
            return;
          }
          // Rotation about +Y by 'angle' (maps +X to (cos, 0, -sin)).
          float c = cos(angle);
          float s = sin(angle);
          vec3 local = position * radii * ${In};
          vec3 galaxy = center + vec3(c * local.x + s * local.z, local.y, -s * local.x + c * local.z);
          vLocal = galaxy;
          vCenter = center;
          vRadii = radii;
          vRot = vec2(c, s);
          vColor = cloudColor * ${jn} * fade;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(galaxy, 1.0);
        }`,fragmentShader:`
        uniform vec3 cameraLocal;
        varying vec3 vLocal;
        varying vec3 vCenter;
        varying vec3 vRadii;
        varying vec2 vRot;
        varying vec3 vColor;
        ${On}

        // Galaxy → the cloud's frame (the inverse of the rotation in the vertex shader).
        vec3 toLocal(vec3 v) {
          return vec3(vRot.x * v.x - vRot.y * v.z, v.y, vRot.y * v.x + vRot.x * v.z);
        }

        void main() {
          vec3 o = toLocal(cameraLocal - vCenter) / vRadii;
          vec3 d = toLocal(normalize(vLocal - cameraLocal)) / vRadii;
          float path = gaussianPath(o, d, ${V.toFixed(1)}, 0.0);
          // 1 through the centre seen face-on (along y), more along longer paths.
          float n = path / (vRadii.y * ${Math.sqrt(Math.PI/V).toFixed(6)});
          float brightness = (1.0 - exp(-n * ${Mn.toFixed(1)})) / ${(1-Math.exp(-2)).toFixed(6)};
          gl_FragColor = vec4(vColor * brightness, 1.0);
          #include <colorspace_fragment>
        }`,side:1,blending:2,transparent:!0,depthWrite:!1});this.mesh=new P(u,d),this.mesh.frustumCulled=!1,this.mesh.renderOrder=-1,this.mesh.onBeforeRender=(e,t,n)=>{this.inverse.copy(this.mesh.matrixWorld).invert(),this.cameraLocal.setFromMatrixPosition(n.matrixWorld).applyMatrix4(this.inverse)},e.add(this.mesh)}dispose(){this.parent.remove(this.mesh),this.mesh.geometry.dispose(),this.mesh.material.dispose()}};function H(e){return .5+e.radius/40}var Rn=.6,zn=[30,90];function Bn(e){let[t,n]=e.stars;if(!t||!n)return null;let r=Rn*(H(t)+H(n)),i=t.mass+n.mass,a=R(e.id,`binary`),o=zn[0]+(zn[1]-zn[0])*((a&65535)/65535);return{offsets:[r*n.mass/i,r*t.mass/i],phase:(a>>>16)/65535*Math.PI*2,speed:Math.PI*2/o}}function Vn(e){if(e.stars.length===0)return Wn;let t=Bn(e);return t?2*Math.max(t.offsets[0]+H(e.stars[0])/2,t.offsets[1]+H(e.stars[1])/2):H(e.stars[0])}var Hn=`#6f86c8`,Un=`#ffd9a0`,Wn=1.1;function Gn(e){switch(e){case`lava`:return`#d8703c`;case`ocean`:return`#5aa6b8`;case`ice`:return`#8fb0d0`;default:return`#9a9088`}}function Kn(e){return[{radii:{x:e*1.3,y:e*.06,z:e*1.3},color:Hn,faceOnOpacity:.16,maxBrightness:.28},{radii:{x:e*.45,y:e*.2,z:e*.45},color:Un,faceOnOpacity:.45,maxBrightness:.8}]}var qn={brightness:1.6},Jn=40,Yn=96,Xn=.95,Zn=.02,Qn=1.06,$n=2,er={emission:0,reflection:1,dark:2,planetary:3,remnant:4},tr={clouds:0,shell:1,ring:2,bipolar:3};function nr(e){e.blending=5,e.blendEquation=100,e.blendSrc=201,e.blendDst=204,e.blendSrcAlpha=200,e.blendDstAlpha=204,e.transparent=!0,e.depthWrite=!1}function rr(e,t=`map`,n){let r=Array.from({length:6},(t,n)=>{let r=e.blobs[n];return r?new Ee(r.center.x,r.center.y,r.center.z,r.weight):new Ee}),i=Array.from({length:6},(t,n)=>{let r=e.blobs[n];return r?new L(r.radii.x,r.radii.y,r.radii.z):new L(1,1,1)}),a=e.shell?new Ee(e.shell.axes.x,e.shell.axes.y,e.shell.axes.z,e.shell.width):new Ee(1,1,1,1),o=new L,s=n?.glows.slice(0,$n)??[],c=Array.from({length:$n},(e,t)=>{let n=s[t];return n?new L(n.radii.x,n.radii.y,n.radii.z):new L(1,1,1)}),l=Array.from({length:$n},(e,t)=>{let n=s[t];return n?new S(n.color).multiplyScalar(n.maxBrightness):new S(0)}),u=Array.from({length:$n},(e,t)=>{let n=s[t];return n?kn(n.radii.y,n.faceOnOpacity,n.maxBrightness):0}),d=t===`bake`?{STEPS:Yn}:{STEPS:Jn,DITHER:1};n&&(d.FRONT_GLOW=1);let f=new A({uniforms:{uNoise:{value:We()},uCamera:{value:o},uKind:{value:er[e.kind]},uShape:{value:tr[e.shape]},uBlobCount:{value:Math.min(e.blobs.length,6)},uBlobs:{value:r},uBlobRadii:{value:i},uShell:{value:a},uStar:{value:new L(e.starLocal.x,e.starLocal.y,e.starLocal.z)},uColor:{value:new S(e.colors[0])},uColor2:{value:new S(e.colors[1])},uGlow:{value:e.glow},uDust:{value:e.dust},uNoiseScale:{value:e.noiseScale},uNoiseOffset:{value:new L(e.noiseOffset.x,e.noiseOffset.y,e.noiseOffset.z)},uBrightness:{value:qn.brightness},uOrigin:{value:new L(e.position.x,e.position.y,e.position.z)},uRotation:{value:new Ut().setFromMatrix4(new M().makeRotationFromQuaternion(new F(e.orientation.x,e.orientation.y,e.orientation.z,e.orientation.w)))},uRadius:{value:e.radius},uGlowCount:{value:s.length},uGlowRadii:{value:c},uGlowColors:{value:l},uGlowDensities:{value:u},uGlowNear:{value:n?.near??0}},vertexShader:`
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,defines:d,fragmentShader:or,side:1});nr(f);let p=new le(Qn,2),m=new P(p,f);m.name=e.name;let h=new M;return m.onBeforeRender=(e,t,n)=>{o.setFromMatrixPosition(n.matrixWorld).applyMatrix4(h.copy(m.matrixWorld).invert()),f.uniforms.uBrightness.value=qn.brightness},m}function ir(e,t,n){e.position.set(t.position.x-(n?.x??0),t.position.y-(n?.y??0),t.position.z-(n?.z??0)),e.quaternion.set(t.orientation.x,t.orientation.y,t.orientation.z,t.orientation.w),e.scale.setScalar(t.radius)}function ar(e,t,n){let r=e.folder(t);return r?.add(qn,`brightness`,0,5).onChange(()=>n?.()),r}var or=`
  precision highp sampler3D;
  #define MAX_BLOBS 6
  #define K ${tt.toFixed(2)}
  uniform sampler3D uNoise;
  uniform vec3 uCamera;
  uniform int uKind;
  uniform int uShape;
  uniform int uBlobCount;
  uniform vec4 uBlobs[MAX_BLOBS];
  uniform vec3 uBlobRadii[MAX_BLOBS];
  uniform vec4 uShell;
  uniform vec3 uStar;
  uniform vec3 uColor;
  uniform vec3 uColor2;
  uniform float uGlow;
  uniform float uDust;
  uniform float uNoiseScale;
  uniform vec3 uNoiseOffset;
  uniform float uBrightness;
  varying vec3 vLocal;

  #ifdef FRONT_GLOW
    #define MAX_GLOWS ${$n}
    uniform vec3 uOrigin;
    uniform mat3 uRotation;
    uniform float uRadius;
    uniform int uGlowCount;
    uniform vec3 uGlowRadii[MAX_GLOWS];
    uniform vec3 uGlowColors[MAX_GLOWS];
    uniform float uGlowDensities[MAX_GLOWS];
    uniform float uGlowNear;
    ${On}

    // The galaxy's glows along the ray from the camera (o, d in the nebula's frame) to 't'
    // (frame units), each as it appears on the canvas (galaxy/glowVolume.ts, sRGB-encoded).
    vec3 frontGlow(vec3 o, vec3 d, float t) {
      vec3 og = uOrigin + uRotation * (o * uRadius);
      vec3 dg = uRotation * d;
      float far = t * uRadius;
      vec3 sum = vec3(0.0);
      if (far <= uGlowNear) return sum;
      for (int i = 0; i < MAX_GLOWS; i++) {
        if (i >= uGlowCount) break;
        vec3 oo = og / uGlowRadii[i];
        vec3 dd = dg / uGlowRadii[i];
        float path = gaussianPath(oo, dd, ${V.toFixed(1)}, uGlowNear) - gaussianPath(oo, dd, ${V.toFixed(1)}, far);
        vec3 glow = uGlowColors[i] * (1.0 - exp(-uGlowDensities[i] * max(path, 0.0)));
        sum += sRGBTransferOETF(vec4(glow, 1.0)).rgb;
      }
      return sum;
    }
  #endif

  // gen/nebulas.ts: shellRadius and bipolarReach.
  float shellRadius(vec3 p) {
    vec3 q = p / uShell.xyz;
    float r = length(q);
    if (uShape != 3 || r < 1e-5) return r;
    return r / (0.4 + 0.6 * pow(abs(q.y) / r, 0.8));
  }

  // gen/nebulas.ts: nebulaDensity (the smooth model).
  float smoothDensity(vec3 p, out float shellR) {
    shellR = 0.0;
    if (uShape == 0) {
      float sum = 0.0;
      for (int i = 0; i < MAX_BLOBS; i++) {
        if (i >= uBlobCount) break;
        vec3 x = (p - uBlobs[i].xyz) / uBlobRadii[i];
        sum += uBlobs[i].w * exp(-K * dot(x, x));
      }
      return sum;
    }
    shellR = shellRadius(p);
    float u = (shellR - 1.0) / uShell.w;
    float d = exp(-0.5 * u * u);
    if (uShape == 2) {
      float y = p.y / uShell.y / 0.3;
      d *= 0.3 + 1.2 * exp(-0.5 * y * y);
    }
    return d;
  }

  void main() {
    vec3 o = uCamera;
    vec3 d = normalize(vLocal - uCamera);
    // The part of the ray inside the unit sphere.
    float b = dot(o, d);
    float h = b * b - (dot(o, o) - 1.0);
    if (h <= 0.0) discard;
    h = sqrt(h);
    float t0 = max(-b - h, 0.0);
    float t1 = -b + h;
    if (t1 <= t0) discard;
    // A fixed step (the sphere's diameter over STEPS), so rays through a nebula's edge take fewer.
    float dt = 2.0 / float(STEPS);
    #ifdef DITHER
      // Interleaved gradient noise: a fixed per-pixel offset hides the steps' banding.
      float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    #else
      float jitter = 0.5;
    #endif

    vec3 light = vec3(0.0);
    float transmit = 1.0;
    // Where along the ray the dust absorbs, weighted by how much it takes out.
    float absorbed = 0.0;
    float absorbedT = 0.0;
    for (int i = 0; i < STEPS; i++) {
      float t = t0 + (float(i) + jitter) * dt;
      if (t > t1 || transmit < 0.01) break;
      vec3 p = o + d * t;
      float shellR;
      float base = smoothDensity(p, shellR);
      // A planetary nebula's thick inner zone of O III inside its Hα rim (gen/nebulas.ts planetaryInner).
      float inner = 0.0;
      if (uKind == 3) {
        float u = (shellR - ${Ct.toFixed(2)}) / (uShell.w * ${it.toFixed(2)});
        inner = ${Gt.toFixed(2)} * exp(-0.5 * u * u);
      }
      if (base + inner < 0.003) continue;
      vec3 q = p * uNoiseScale + uNoiseOffset;
      vec2 n = texture(uNoise, q).rg;
      float structure;
      vec3 color = uColor;
      float lit = 1.0;
      if (uKind == 4) {
        // Supernova remnant: thin, bright filaments (ridged noise, mean 1), red and teal.
        float ridge = 1.0 - abs(2.0 * n.r - 1.0);
        structure = 9.0 * pow(ridge, 8.0) * (0.5 + n.g);
        color = mix(uColor, uColor2, smoothstep(0.35, 0.65, texture(uNoise, q * 0.5 + 0.31).r));
      } else if (uKind == 3) {
        // Planetary nebula: teal O III inside, red Hα round the rim, a little knotty.
        structure = 0.55 + 0.9 * (0.7 * n.r + 0.3 * n.g);
        color = (uColor * base + uColor2 * inner) / (base + inner);
        base += inner;
      } else {
        // Clumps and wisps (mean ~1): most of the light from a minority of the gas.
        float c = 0.7 * n.r + 0.3 * n.g;
        structure = 4.0 * c * c * c;
        float s2 = dot(p - uStar, p - uStar);
        if (uKind < 2) base *= 1.0 - ${Xn.toFixed(2)} * exp(-s2 / ${Zn.toFixed(3)});
        if (uKind == 0) {
          // The hot O III core round the star; brighter nearer it.
          color = mix(uColor, uColor2, ${Mt.toFixed(2)} * exp(-s2 / ${Vt.toFixed(3)}));
          lit = 0.5 + exp(-s2 / 0.15);
        } else if (uKind == 1) {
          // Starlight scattered by dust: bright by the star, whiter right next to it.
          color = mix(uColor, uColor2, exp(-s2 / 0.02));
          lit = 0.3 + 1.5 * exp(-s2 / 0.08);
        }
      }
      float density = base * structure;
      light += transmit * color * (uGlow * lit * density * dt);
      // Dust: in emission nebulas lanes and pillars of its own, elsewhere it follows the gas.
      float dust = uKind == 0 ? smoothstep(0.45, 0.75, texture(uNoise, q * 1.7 + 0.53).r) * 2.5 : structure;
      float taken = transmit * (1.0 - exp(-uDust * base * dust * dt));
      absorbed += taken;
      absorbedT += taken * t;
      transmit -= taken;
    }
    // Soft saturation on the brightest channel, so the brightest parts level off in their own colour.
    float peak = max(max(light.r, light.g), light.b);
    light *= (1.0 - exp(-peak * uBrightness)) / max(peak, 1e-6);
    #ifdef FRONT_GLOW
      // Blended over the canvas's glow (dst · transmit), so the glow in front of the
      // dust is put back: front + behind · transmit, all as the canvas holds it.
      float depth = absorbed > 1e-4 ? absorbedT / absorbed : t0;
      vec3 front = frontGlow(o, d, depth);
      gl_FragColor = vec4(sRGBTransferOETF(vec4(light, 1.0)).rgb + front * (1.0 - transmit), transmit);
    #else
      gl_FragColor = vec4(light, transmit);
      #include <colorspace_fragment>
    #endif
  }`;function sr(e){let t=[],n=[],r=new F,i=new M,a=new L;for(let o of e)if(Pt(o)){r.set(o.orientation.x,o.orientation.y,o.orientation.z,o.orientation.w);for(let e of o.blobs){if(t.length>=32)break;a.set(e.center.x,e.center.y,e.center.z).multiplyScalar(o.radius).applyQuaternion(r),t.push(new Ee(o.position.x+a.x,o.position.y+a.y,o.position.z+a.z,o.dust*e.weight/o.radius)),i.makeRotationFromQuaternion(r).invert();let s=new Ut().setFromMatrix4(i),c=new Ut().set(1/(e.radii.x*o.radius),0,0,0,1/(e.radii.y*o.radius),0,0,0,1/(e.radii.z*o.radius));n.push(c.multiply(s))}}let o=t.length;for(;t.length<32;)t.push(new Ee);for(;n.length<32;)n.push(new Ut);return{uDimCount:{value:o},uDimBlobs:{value:t},uDimMatrices:{value:n}}}var cr=`
  #define MAX_DIM_BLOBS 32
  uniform int uDimCount;
  uniform vec4 uDimBlobs[MAX_DIM_BLOBS];
  uniform mat3 uDimMatrices[MAX_DIM_BLOBS];

  float erfcDim(float x) {
    float z = abs(x);
    float t = 1.0 / (1.0 + 0.3275911 * z);
    float y = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    float r = y * exp(-z * z);
    return x >= 0.0 ? r : 2.0 - r;
  }

  float starDimming(vec3 from, vec3 to) {
    if (uDimCount == 0) return 1.0;
    vec3 ray = to - from;
    float len = length(ray);
    vec3 dir = ray / max(len, 1e-6);
    float depth = 0.0;
    for (int i = 0; i < MAX_DIM_BLOBS; i++) {
      if (i >= uDimCount) break;
      vec3 o = uDimMatrices[i] * (from - uDimBlobs[i].xyz);
      vec3 d = uDimMatrices[i] * dir;
      float a = dot(d, d);
      float m = dot(o, d) / a;
      float perp2 = max(dot(o, o) - m * m * a, 0.0);
      float ka = ${tt.toFixed(2)} * a;
      float scale = exp(-${tt.toFixed(2)} * perp2) * 0.886226925 / sqrt(ka);
      // The column between 'from' and the star: from 0 to len along the ray.
      float column = scale * (erfcDim(sqrt(ka) * m) - erfcDim(sqrt(ka) * (m + len)));
      depth += uDimBlobs[i].w * column;
    }
    return exp(-depth);
  }
`,lr=class{texture;scene=new pt;target;camera;meshes;clear=new S;constructor(e,t,n,i){this.target=new r(i,{generateMipmaps:!1}),this.target.texture.colorSpace=Tt,this.texture=this.target.texture,this.camera=new Te(.01,5e3,this.target);let a=new E;a.quaternion.copy(n),this.scene.add(a),this.meshes=e.map(e=>{let n=rr(e,`bake`);return ir(n,e,t),a.add(n),n}),this.scene.updateMatrixWorld(!0)}get size(){return this.target.width}bake(e){e.getClearColor(this.clear);let t=e.getClearAlpha();e.setClearColor(0,1),this.camera.update(e,this.scene),e.setClearColor(this.clear,t)}stats(e,t=8){let n=this.target.width,r=new Uint8Array(n*n*4),i=0,a=0,o=0;for(let s=0;s<6;s++){e.readRenderTargetPixels(this.target,0,0,n,n,r,s);for(let e=0;e<n;e+=t)for(let s=0;s<n;s+=t){let t=4*(e*n+s);i+=(r[t]+r[t+1]+r[t+2])/765,a+=r[t+3]/255,o++}}return{light:i/o,transmittance:a/o}}dispose(){for(let e of this.meshes)e.geometry.dispose(),e.material.dispose();this.target.dispose()}},ur={resolution:1/3},dr=class{scene;root;nebulas;meshes;volumes=new pt;frame=new E;target=new l(1,1,{type:ze,depthBuffer:!1});quad;size=new D;texel=new D;clear=new S;shown=!0;constructor(e,t,n,r,i){this.scene=e,this.root=t,this.nebulas=n,this.frame.matrixAutoUpdate=!1,this.volumes.add(this.frame);let a={glows:Kn(r),near:250};this.meshes=n.map(e=>{let t=rr(e,`map`,a);return ir(t,e),this.frame.add(t),t});let o=new A({uniforms:{map:{value:this.target.texture},texel:{value:this.texel}},vertexShader:`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          // On the far plane, depth-tested: it only covers what nothing solid (the UFO, a star close up) is in front of.
          gl_Position = vec4(position.xy * 2.0, 1.0, 1.0);
        }`,fragmentShader:`
        uniform sampler2D map;
        uniform vec2 texel;
        varying vec2 vUv;
        void main() {
          // A small blur (four bilinear taps round the middle one) smooths out the march's per-pixel dither.
          vec2 o = texel * 0.75;
          gl_FragColor = 0.2 * (texture2D(map, vUv) +
            texture2D(map, vUv + vec2(o.x, o.y)) + texture2D(map, vUv + vec2(-o.x, o.y)) +
            texture2D(map, vUv + vec2(o.x, -o.y)) + texture2D(map, vUv + vec2(-o.x, -o.y)));
          // Already in the canvas's colour space (the volumes encode their own light).
        }`});nr(o),this.quad=new P(new Bt(1,1),o),this.quad.name=`Nebulas`,this.quad.frustumCulled=!1,this.quad.renderOrder=-.5,e.add(this.quad),ar(i,`Galaxy nebulas`)?.add(ur,`resolution`,.1,1).name(`map resolution`)}set visible(e){this.shown=e,this.quad.visible=e}get visible(){return this.shown}get count(){return this.meshes.length}renderVolumes(e,t){if(!this.shown)return;e.getDrawingBufferSize(this.size);let n=Math.max(1,Math.round(this.size.x*ur.resolution)),r=Math.max(1,Math.round(this.size.y*ur.resolution));(this.target.width!==n||this.target.height!==r)&&(this.target.setSize(n,r),this.texel.set(1/n,1/r)),this.root.updateMatrixWorld(),this.frame.matrix.copy(this.root.matrixWorld),this.frame.matrixWorldNeedsUpdate=!0;let i=e.getRenderTarget();e.getClearColor(this.clear);let a=e.getClearAlpha();e.setClearColor(0,1),e.setRenderTarget(this.target),e.clear(!0,!1,!1),e.render(this.volumes,t),e.setRenderTarget(i),e.setClearColor(this.clear,a)}dispose(){this.scene.remove(this.quad),this.quad.geometry.dispose(),this.quad.material.dispose();for(let e of this.meshes)e.geometry.dispose(),e.material.dispose();this.target.dispose()}},fr=(at.survivable.min+at.survivable.max)/2,pr=288.15;function mr(e,t){return e>=1?`habitable`:t>fr?`hot`:`cold`}function hr(e){return e.composition===`none`||e.pressure<.001?`none`:e.pressure<.3?`thin`:e.pressure<3?`normal`:`thick`}function gr(e){return{warmth:mr(e.habitability,e.temperature),air:hr(e)}}function _r(e){let t=0,n=e.planets.map(n=>{t+=n.moons.length;let r=n.moons.map(e=>({...gr(e.climate),big:e.radius>=Rt.bigMin})),i={name:n.name,size:n.size,rings:n.rings!==null,moons:r};if(n.climate)return{...i,tier:n.climate.habitability,...gr(n.climate)};let a=pr*((e.habitableRadius/n.orbit.radius)**2)**.25;return{...i,tier:0,warmth:mr(0,a),air:`thick`}}),r=new Set(e.belts.flatMap(e=>e.trojan?[e.trojan.planet]:[])),i=e.belts.filter(e=>!e.trojan).length+r.size;return{planets:n,moonCount:t,beltCount:i}}function vr(e){let t=e.planets.length;if(t===0)return`No planets`;let n=[`${t} planet${t===1?``:`s`}`],r=e.moonCount;r>0&&n.push(`${r} moon${r===1?``:`s`}`);let i=e.beltCount??0;return i>0&&n.push(`${i} belt${i===1?``:`s`}`),n.join(` · `)}function yr(e,t){let n=document.createElement(`div`);n.className=`sys-count`,n.textContent=vr(t),e.append(n);for(let n of t.planets){let t=document.createElement(`div`);t.className=`sys-row`;let r=document.createElement(`span`);r.className=`sys-tier sys-tier-${n.tier}`,r.textContent=`T${n.tier}`;let i=document.createElement(`span`);i.className=`sys-name`,i.textContent=n.name;let a=document.createElement(`span`);a.className=`sys-slot`;let o=br(n,`sys-planet sys-size-${n.size}`);if(Xe(n.size)&&o.classList.add(`sys-giant`),n.rings&&o.classList.add(`sys-ringed`),a.append(o),t.append(a,r,i),n.moons.length>0){let e=document.createElement(`span`);e.className=`sys-moons`;for(let t of n.moons)e.append(br(t,t.big?`sys-moon sys-moon-big`:`sys-moon`));t.append(e)}e.append(t)}}function br(e,t){let n=document.createElement(`span`);return n.className=`sys-disc ${t} sys-${e.warmth} sys-air-${e.air}`,n}var xr=.1,Sr=64,Cr=`Click a star, rogue planet or nebula: travel there · Scroll in at a star or rogue: enter it · Scroll: zoom · Drag: rotate view · M: mute · Esc: menu`,wr=`Tap a star, rogue planet or nebula: travel there · Pinch in at a star or rogue: enter it · Pinch: zoom · Drag: rotate view · Hold: identify`,Tr=class{camera;input;galaxy;ship;picker;tooltip;map;root;locationEl=document.getElementById(`hud-location`);speedEl=document.getElementById(`hud-speed`);targetEl=document.getElementById(`hud-target`);help;currentRing;destinationRing;hoverRing;at=new L;sinceRefresh=xr;summaries=new Map;rogueLines=new Map;active=!1;hideMarkers=!1;constructor(e,t,n,r,i,a,o,s,c){this.camera=t,this.input=n,this.galaxy=r,this.ship=i,this.picker=a,this.tooltip=o,this.map=s,this.root=c,this.currentRing=new me(e,`#66ffcc`,0,.08),this.destinationRing=new me(e,`#66ffcc`,.08,.08),this.hoverRing=new me(e,`#cfe3ff`,0,.08),this.help=new yt(n,Cr,wr)}activate(){this.active=!0,this.help.refresh(!0),this.speedEl.textContent=``,this.sinceRefresh=xr}deactivate(){this.active=!1,this.tooltip.hide()}update(t){let{ship:n}=this,r=this.picker.hovered,i=!this.hideMarkers;if(this.mark(this.currentRing,i&&!n.travelling?n.current:null,.5,t),this.mark(this.destinationRing,i?n.destination:null,.9,t),this.mark(this.hoverRing,i&&r!==n.current&&r!==n.destination?r:null,.35,t),!this.active)return;this.map.holdSteady(n.destination??n.current,r);let a=this.picker.hoveredNebula,{clientX:o,clientY:s}=this.input.pointer;if(r){let e=r===n.current&&!n.travelling?` · you are here`:``,t=r.nebula?` · in the ${r.nebula.name}`:``;this.tooltip.show(r,r.name,this.describe(r)+t+e,o,s,void 0,this.input.touchMode,e=>yr(e,this.summary(r)))}else a?this.tooltip.show(a,a.name,ct(a.kind),o,s,void 0,this.input.touchMode):this.tooltip.hide();this.sinceRefresh+=t,!(this.sinceRefresh<xr)&&(this.sinceRefresh=0,this.help.refresh(),this.locationEl.textContent=n.travelling?`Galaxy · ${this.galaxy.stars.length} stars · in deep space`:`Galaxy · ${this.galaxy.stars.length} stars · at ${n.current.name}`+(e(n.current)?` (rogue planet)`:``)+(n.current.nebula?` · in the ${n.current.nebula.name}`:``),this.targetEl.textContent=n.destination?`Travelling → ${n.destination.name}`:``)}dispose(){this.currentRing.dispose(),this.destinationRing.dispose(),this.hoverRing.dispose(),this.tooltip.hide()}describe(t){if(!e(t))return xt(t.stars)+(t.young?` · young, in a dusty disc`:``);let n=this.rogueLines.get(t.id);if(!n){let e=b(t).planets[0];n=Se(he(e.type,e.size)),this.rogueLines.set(t.id,n)}return n}summary(e){let t=this.summaries.get(e.id);return t||(t=_r(b(e)),this.summaries.size>=Sr&&this.summaries.delete(this.summaries.keys().next().value),this.summaries.set(e.id,t)),t}mark(e,t,n,r){if(!t){e.hide();return}this.at.set(t.position.x,t.position.y,t.position.z).applyMatrix4(this.root.matrixWorld);let i=Math.max(Vn(t)*1.2+.6,this.at.distanceTo(this.camera.position)*.02);e.place(this.at,i,n,this.camera,r)}},Er=2,Dr=64,U={twinkle:.15,twinkleSpeed:4.5},Or=class{parent;positions;points;glows=[];bufferSize=new D;steady=new D(-1,-1);faded=new D(-1,0);closeUp=[new L,new L];converge={value:0};cameraLocal=new L;inverse=new M;time=0;constructor(e,t,n){this.parent=e;let r=t.stars.length;this.positions=new Float32Array(r*3);let i=t.stars.reduce((e,t)=>e+t.stars.length,0),a=new Float32Array(i*3),o=new Float32Array(i*3),s=new Float32Array(i),c=new Float32Array(i),l=new Float32Array(i*3),u=new S,d=0;t.stars.forEach((e,t)=>{let{x:n,y:r,z:i}=e.position;this.positions.set([n,r,i],t*3);let f=Bn(e);e.stars.forEach((t,p)=>{a.set([n,r,i],d*3),u.set(t.color).toArray(o,d*3),s[d]=H(t),c[d]=e.id,f&&l.set([f.offsets[p]*(p?-1:1),f.phase,f.speed],d*3),d++})});let f=new w;f.setAttribute(`position`,new C(a,3)),f.setAttribute(`color`,new C(o,3)),f.setAttribute(`size`,new C(s,1)),f.setAttribute(`starId`,new C(c,1)),f.setAttribute(`orbit`,new C(l,3));let p=new A({uniforms:{scale:{value:1},minSize:{value:Er},maxSize:{value:Dr},time:{value:0},twinkle:{value:U.twinkle},twinkleSpeed:{value:U.twinkleSpeed},steady:{value:this.steady},faded:{value:this.faded},closeUp:{value:this.closeUp},converge:this.converge,cameraLocal:{value:this.cameraLocal},...sr(t.nebulas)},vertexShader:`
        attribute float size;
        attribute vec3 color;
        attribute float starId;
        attribute vec3 orbit;
        uniform float scale;
        uniform float minSize;
        uniform float maxSize;
        uniform float time;
        uniform float twinkle;
        uniform float twinkleSpeed;
        uniform vec2 steady;
        uniform vec2 faded;
        uniform vec3 closeUp[2];
        uniform float converge;
        uniform vec3 cameraLocal;
        varying vec3 vColor;
        varying float vDim;
        ${cr}
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // Binary members turn about their centre of mass in the view plane.
          float a = orbit.y + time * orbit.z;
          mv.xy += vec2(cos(a), sin(a)) * orbit.x;
          // The faded star's dots move to where its close-up draws its members (member 1 has the negative offset).
          bool fading = abs(starId - faded.x) < 0.5;
          if (fading && converge > 0.0) {
            vec4 target = modelViewMatrix * vec4(orbit.x < 0.0 ? closeUp[1] : closeUp[0], 1.0);
            mv = mix(mv, target, converge);
          }
          float px = size * scale / -mv.z;
          gl_PointSize = clamp(px, minSize, maxSize);
          // Dots clamped up to the minimum size get dimmer instead of bigger.
          vDim = clamp(px / minSize, 0.6, 1.0);

          // Twinkle: two detuned sines per star, phases and rates from golden-ratio hashes of its id.
          float h1 = fract(starId * 0.6180339 + sign(orbit.x) * 0.25);
          float h2 = fract(starId * 0.7548777);
          float f = twinkleSpeed * (0.35 + 0.65 * h1);
          float wave = 0.6 * sin(time * f + h2 * 6.2832) + 0.4 * sin(time * f * 1.73 + h1 * 6.2832);
          float small = 1.0 - smoothstep(minSize, minSize * 4.0, px);
          bool held = abs(starId - steady.x) < 0.5 || abs(starId - steady.y) < 0.5;
          vDim *= held ? 1.0 : 1.0 + twinkle * (1.0 + 0.6 * small) * wave;
          if (fading) vDim *= 1.0 - faded.y;
          // Hidden behind dark nebulas.
          vDim *= starDimming(cameraLocal, position);

          vColor = color;
          gl_Position = projectionMatrix * mv;
        }`,fragmentShader:`
        varying vec3 vColor;
        varying float vDim;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;
          // Hot white-ish core and a coloured halo.
          float core = smoothstep(0.35, 0.0, d);
          float halo = pow(1.0 - d, 2.0);
          vec3 c = vColor * halo + mix(vColor, vec3(1.0), 0.6) * core;
          gl_FragColor = vec4(c * vDim, 1.0);
          #include <colorspace_fragment>
        }`,blending:2,transparent:!0,depthWrite:!1});this.points=new $e(f,p),this.points.frustumCulled=!1,this.points.onBeforeRender=(e,t,n)=>{let r=n,i=e.getDrawingBufferSize(this.bufferSize).y,a=e.getPixelRatio(),o=p.uniforms;o.scale.value=i/(2*Math.tan(k.degToRad(r.fov)/2)),o.minSize.value=Er*a,o.maxSize.value=Dr*a,o.time.value=this.time,o.twinkle.value=U.twinkle,o.twinkleSpeed.value=U.twinkleSpeed,this.inverse.copy(this.points.matrixWorld).invert(),this.cameraLocal.setFromMatrixPosition(n.matrixWorld).applyMatrix4(this.inverse)},e.add(this.points);let m=n.folder(`Galaxy stars`);m?.add(U,`twinkle`,0,.6),m?.add(U,`twinkleSpeed`,0,15);for(let e of Kn(t.radius))this.addGlow(e)}get dotCount(){return this.points.geometry.getAttribute(`position`).count}holdSteady(e,t){this.steady.set(e?.id??-1,t?.id??-1)}fade(e,t){this.faded.set(e&&t>0?e.id:-1,t)}convergeTo(e,t){e.forEach((e,t)=>this.closeUp[t]?.copy(e)),e.length===1&&this.closeUp[1].copy(e[0]),this.converge.value=e.length>0?t:0}update(e){this.time+=e}dispose(){this.parent.remove(this.points),this.points.geometry.dispose(),this.points.material.dispose();for(let e of this.glows)this.parent.remove(e),e.geometry.dispose(),e.material.dispose()}addGlow(e){let t=An(new L(e.radii.x,e.radii.y,e.radii.z),e.color,e.faceOnOpacity,e.maxBrightness,250);t.renderOrder=-1,this.parent.add(t),this.glows.push(t)}};function kr(e,t,n,r){let i=-1,a=Math.tan(r);for(let r=0,o=n.length/3;r<o;r++){let o=n[r*3]-e.x,s=n[r*3+1]-e.y,c=n[r*3+2]-e.z,l=o*t.x+s*t.y+c*t.z;if(l<=0)continue;let u=Math.sqrt(Math.max(0,o*o+s*s+c*c-l*l))/l;u<a&&(a=u,i=r)}return i}var Ar=.6;function jr(e,t,n){let r=-1,i=Ar;return n.forEach((n,a)=>{let o=n.position.x-e.x,s=n.position.y-e.y,c=n.position.z-e.z,l=o*o+s*s+c*c;if(l<=n.radius*n.radius)return;let u=o*t.x+s*t.y+c*t.z;if(u<=0)return;let d=Math.sqrt(Math.max(0,l-u*u))/n.radius;d<i&&(i=d,r=a)}),r}var Mr=10,Nr=class{camera;input;canvas;galaxy;refs;positions;ship;root;sfx;hovered=null;hoveredNebula=null;raycaster=new nt;ndc=new D;inverse=new M;constructor(e,t,n,r,i,a,o,s,c){this.camera=e,this.input=t,this.canvas=n,this.galaxy=r,this.refs=i,this.positions=a,this.ship=o,this.root=s,this.sfx=c}update(){let{pointer:e}=this.input,t=e.inside&&!this.input.isDragging&&!this.input.blocked;this.hovered=t?this.pick(e.ndcX,e.ndcY):null,this.hoveredNebula=t&&!this.hovered?this.pickNebula(e.ndcX,e.ndcY):null;let n=this.input.consumeClick();if(!n)return;let r=this.pick(n.ndcX,n.ndcY),i=r?null:this.pickNebula(n.ndcX,n.ndcY),a=r??(i?this.galaxy.stars[i.star]:null);a&&(this.sfx.play(`select`),this.ship.travelTo(a))}dispose(){}pickNebula(e,t){let{ray:n}=this.ray(e,t),r=jr(n.origin,n.direction,this.galaxy.nebulas);return r>=0?this.galaxy.nebulas[r]:null}ray(e,t){return this.raycaster.setFromCamera(this.ndc.set(e,t),this.camera),this.raycaster.ray.applyMatrix4(this.inverse.copy(this.root.matrixWorld).invert()),this.raycaster}pick(e,t){let{ray:n}=this.ray(e,t),r=2*Math.tan(k.degToRad(this.camera.fov)/2)/this.canvas.clientHeight,i=kr(n.origin,n.direction,this.positions,Mr*r);return i>=0?this.refs[i]:null}},Pr=5,Fr=40,Ir={brightness:.75,pulse:6},Lr=class{parent;positions;points;bufferSize=new D;faded=new D(-1,0);cameraLocal=new L;inverse=new M;time=0;constructor(e,t,n){this.parent=e;let r=t.rogues.length;this.positions=new Float32Array(r*3);let i=new Float32Array(r*3),a=new Float32Array(r),o=new S;t.rogues.forEach((e,t)=>{let{x:n,y:r,z:s}=e.position;this.positions.set([n,r,s],t*3),o.set(Gn(b(e).planets[0].type)).toArray(i,t*3),a[t]=e.id});let s=new w;s.setAttribute(`position`,new C(this.positions,3)),s.setAttribute(`color`,new C(i,3)),s.setAttribute(`rogueId`,new C(a,1));let c=new A({uniforms:{scale:{value:1},size:{value:Wn},minSize:{value:Pr},maxSize:{value:Fr},brightness:{value:Ir.brightness},time:{value:0},pulse:{value:Ir.pulse},faded:{value:this.faded},cameraLocal:{value:this.cameraLocal},...sr(t.nebulas)},vertexShader:`
        attribute vec3 color;
        attribute float rogueId;
        uniform float scale;
        uniform float size;
        uniform float minSize;
        uniform float maxSize;
        uniform float brightness;
        uniform float time;
        uniform float pulse;
        uniform vec2 faded;
        uniform vec3 cameraLocal;
        varying vec3 vColor;
        varying float vDim;
        ${cr}
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float px = size * scale / -mv.z;
          gl_PointSize = clamp(px, minSize, maxSize);
          // A slow swell, out of step between rogues.
          float phase = fract(rogueId * 0.6180339) * 6.2832;
          vDim = brightness * (0.8 + 0.2 * sin(time * 6.2832 / pulse + phase));
          if (abs(rogueId - faded.x) < 0.5) vDim *= 1.0 - faded.y;
          vDim *= starDimming(cameraLocal, position);
          vColor = color;
          gl_Position = projectionMatrix * mv;
        }`,fragmentShader:`
        varying vec3 vColor;
        varying float vDim;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;
          // A thin bright rim round a dark disc (the planet's night side), with a faint halo outside it.
          float rim = smoothstep(0.42, 0.62, d) * (1.0 - smoothstep(0.62, 0.8, d));
          float halo = 0.25 * (1.0 - smoothstep(0.62, 1.0, d));
          gl_FragColor = vec4(vColor * (rim + halo) * vDim, 1.0);
          #include <colorspace_fragment>
        }`,blending:2,transparent:!0,depthWrite:!1});this.points=new $e(s,c),this.points.name=`Rogue planets`,this.points.frustumCulled=!1,this.points.onBeforeRender=(e,t,n)=>{let r=n,i=e.getDrawingBufferSize(this.bufferSize).y,a=e.getPixelRatio(),o=c.uniforms;o.scale.value=i/(2*Math.tan(k.degToRad(r.fov)/2)),o.minSize.value=Pr*a,o.maxSize.value=Fr*a,o.brightness.value=Ir.brightness,o.pulse.value=Ir.pulse,o.time.value=this.time,this.inverse.copy(this.points.matrixWorld).invert(),this.cameraLocal.setFromMatrixPosition(n.matrixWorld).applyMatrix4(this.inverse)},e.add(this.points);let l=n.folder(`Galaxy rogues`);l?.add(Ir,`brightness`,0,2),l?.add(Ir,`pulse`,1,20),l?.add(this.points,`visible`).name(`show`)}fade(e,t){this.faded.set(e&&t>0?e.id:-1,t)}update(e){this.time+=e}dispose(){this.parent.remove(this.points),this.points.geometry.dispose(),this.points.material.dispose()}},Rr={maxSpeed:150,accel:200,gain:8,damping:0},zr=1.2,Br=.3,Vr=.05,Hr=.5,Ur=class{parent;sfx;object=new E;hull;ring;dive=0;_current;_destination=null;travelSound=null;prev=new L;curr=new L;vel=new L;goal=new L;impulse=new L;zero=new L;constructor(e,t,n,r){this.parent=e,this.sfx=r;let{group:i,ring:a}=St();i.scale.setScalar(Br),this.object.add(i),this.hull=i,this.ring=a,e.add(this.object),this._current=t,this.dockAt(t);let o=n.folder(`Galaxy travel`);o?.add(Rr,`maxSpeed`,10,1e3),o?.add(Rr,`accel`,10,2e3),o?.add(Rr,`gain`,1,20)}get current(){return this._current}get destination(){return this._destination}get travelling(){return this._destination!==null}get speed(){return this.vel.length()}setDive(e){this.dive=e,this.hull.scale.setScalar(Br*(1-e)),this.hull.visible=e<1}travelTo(e){let t=!this.travelling&&e===this._current?null:e;t&&t!==this._destination&&(this.travelSound??=this.sfx.start(`interstellarTravel`)),this._destination=t,t||this.silence()}silence(){this.travelSound?.stop(),this.travelSound=null}jumpTo(e){this.silence(),this._destination=null,this._current=e,this.dockAt(e)}fixedUpdate(e){this.prev.copy(this.curr);let t=this._destination;t&&(this.goal.set(t.position.x,t.position.y+zr,t.position.z),i(this.curr,this.vel,this.goal,this.zero,Rr,e,this.impulse),this.vel.add(this.impulse),this.curr.addScaledVector(this.vel,e),this.curr.distanceTo(this.goal)<Vr&&this.vel.length()<Hr&&(this._current=t,this._destination=null,this.dockAt(t),this.silence()))}update(e,t){if(this.object.position.lerpVectors(this.prev,this.curr,t),this.object.position.y-=zr*this.dive,this.vel.lengthSq()>1){let t=Math.atan2(-this.vel.x,-this.vel.z),n=Math.atan2(Math.sin(t-this.object.rotation.y),Math.cos(t-this.object.rotation.y));this.object.rotation.y+=n*(1-Math.exp(-5*e))}this.ring.rotation.y+=e*2}dispose(){this.silence(),this.parent.remove(this.object),this.object.traverse(e=>{e instanceof P&&(e.geometry.dispose(),e.material.dispose())})}dockAt(e){this.curr.set(e.position.x,e.position.y+zr,e.position.z),this.prev.copy(this.curr),this.vel.set(0,0,0),this.object.position.copy(this.curr)}},Wr={minutesPerTurn:60},Gr=class{root;constructor(e,t){this.root=e,t.folder(`Galaxy spin`)?.add(Wr,`minutesPerTurn`,.2,240)}get angle(){return this.root.rotation.y}update(e){let t=Math.PI*2*e/(Wr.minutesPerTurn*60);this.root.rotation.y=(this.root.rotation.y+t)%(Math.PI*2),this.root.updateMatrixWorld()}dispose(){}},Kr=class{parent;system;clock;object=new E;looks;constructor(e,t,n,r,i){this.parent=e,this.system=n,this.clock=i;let{x:a,y:o,z:s}=t.position;this.object.position.set(a,o,s);let c=n.galacticTilt;this.object.quaternion.set(c.x,c.y,c.z,c.w),this.object.scale.setScalar(r),this.looks=n.stars.map((e,t)=>{let r=new Me(e,h(e),R(n.seed,`star`,t));return this.object.add(r.object),r}),e.add(this.object),this.update()}update(){let e=this.clock();this.system.stars.forEach((t,n)=>{let r=this.looks[n];ce(t.orbit,e,r.object.position),r.animate(e)})}memberPositions(e){return this.object.updateMatrix(),this.looks.forEach((t,n)=>{e[n]=(e[n]??new L).copy(t.object.position).applyMatrix4(this.object.matrix)}),e.length=this.looks.length,e}dispose(){this.parent.remove(this.object);for(let e of this.looks)e.dispose()}},qr={lead:1.1,overlap:.5,tail:.9,handoverAngle:.035,handoverOut:1.6,galaxyHandover:3},Jr={lead:.9,overlap:.45,tail:.85,handoverAngle:.3,minRadii:1.3,inFraction:.7,outFactor:1.3};function Yr(e){let t=Math.min(1,Math.max(0,e));return t*t*(3-2*t)}function Xr(e){return e.lead+e.overlap+e.tail}function Zr(e,t=qr){return e/Math.tan(t.handoverAngle)}function Qr(e,t,n=qr){return Math.max(Zr(e,n),t*n.handoverOut)}function $r(e,t=qr){return t.galaxyHandover/e}function ei(e,t,n=Jr){let r=e/Math.sin(n.handoverAngle);return Math.max(n.minRadii*e,Math.min(r,n.inFraction*t))}function ti(e,t,n=Jr){return Math.max(e/Math.sin(n.handoverAngle),n.outFactor*t,n.minRadii*e)}function ni(e,t){return e+t}function ri(e,t,n){return e-t*n}function ii(e,t){let n=Xr(e);return{distance:Math.exp(ai(e,Math.min(Math.max(t,0),n))),blend:e.overlap>0?Yr((t-e.lead)/e.overlap):+(t>=e.lead),lead:e.lead>0?Yr(t/e.lead):1,tail:e.tail>0?Yr((t-e.lead-e.overlap)/e.tail):+(t>=n),done:t>=n}}function ai(e,t){let n=Math.log(e.start),r=Math.log(e.handover),i=Math.log(e.end),a=e.lead+e.overlap/2,o=Xr(e),s=a>0?(r-n)/a:0,c=o>a?(i-r)/(o-a):0,l=s*c>0?Math.sign(s)*Math.min(Math.abs(s+c)/2,3*Math.abs(s),3*Math.abs(c)):c;return t<a?oi(n,0,r,l,0,a,t):oi(r,l,i,0,a,o,t)}function oi(e,t,n,r,i,a,o){let s=a-i;if(s<=0)return n;let c=(o-i)/s,l=c*c,u=l*c;return(2*u-3*l+1)*e+(u-2*l+c)*s*t+(-2*u+3*l)*n+(u-l)*s*r}var si={minDistance:8,maxDistance:2600,zoomSpeed:.0025,rotateSpeed:.005,damping:.1},ci=35*Math.PI/180,li=.6,ui=class extends ft{root=new E;ship;orbit;map;rogues;spin;distantGalaxies;nebulas;hud;light;closeUp=null;dive=0;members=[];tilt=new F;constructor(e,t,n,r,i,a,o,s,c){super(),this.light=new te(`#cfe3ff`,`#302040`,2),this.scene.add(this.light),this.scene.add(this.root),this.spin=this.add(new Gr(this.root,o)),this.distantGalaxies=this.add(new En(this.scene,bn(e.seed),o)),this.add(new Ln(this.root,Ae(e),e.radius)),this.nebulas=this.add(new dr(this.scene,this.root,e.nebulas,e.radius,o)),this.map=this.add(new Or(this.root,e,o)),this.rogues=this.add(new Lr(this.root,e,o)),this.ship=this.add(new Ur(this.root,t,o,s)),this.orbit=this.add(new tn(n,this.ship.object,r,si,{distance:60,onZoomPastLimit:e=>e<0&&c(),zoomLimitsHold:()=>this.ship.travelling},o,`Galaxy camera`));let l=new Float32Array(this.map.positions.length+this.rogues.positions.length);l.set(this.map.positions),l.set(this.rogues.positions,this.map.positions.length);let u=this.add(new Nr(n,r,i,e,[...e.stars,...e.rogues],l,this.ship,this.root,s));this.hud=this.add(new Tr(this.scene,n,r,e,this.ship,u,a,this.map,this.root))}showCloseUp(e,t,n){this.hideCloseUp(),this.closeUp=new Kr(this.root,this.ship.current,e,t,n)}hideCloseUp(){this.closeUp?.dispose(),this.closeUp=null,this.map.convergeTo([],0)}setDive(e){this.dive=e,this.ship.setDive(e),this.map.fade(this.ship.current,e),this.rogues.fade(this.ship.current,e),this.hud.hideMarkers=e>0}systemRotation(e,t){let n=e.galacticTilt;return t.copy(this.root.quaternion).multiply(this.tilt.set(n.x,n.y,n.z,n.w))}update(e,t){super.update(e,t),this.closeUp&&(this.closeUp.update(),this.map.convergeTo(this.closeUp.memberPositions(this.members),Yr(this.dive/li)))}render(e,t){this.nebulas.renderVolumes(e,t),super.render(e,t)}enter(){this.hud.activate()}exit(){this.hud.deactivate(),this.ship.silence()}dispose(){this.hideCloseUp(),super.dispose(),this.scene.remove(this.root),this.scene.remove(this.light),this.light.dispose()}},di={scale:30,reach:6,nearFrom:.4,nearTo:3},fi={mainSequence:1,redDwarf:.9,whiteDwarf:1.2,redGiant:.8,blueGiant:1.05},pi=(e,t,n)=>{let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)};function mi(e,t,n,r=di){let i=Math.max(0,e-t)/(t+r.scale),a=1/(1+(i/r.reach)**2),o=pi(r.nearFrom,r.nearTo,i)*(Math.PI/2);return n.near=a*Math.cos(o),n.far=a*Math.sin(o),n}var hi={near:0,far:0};function gi(e,t,n,r=di){let i=0,a=0;for(let n=0;n<e.length;n++)mi(e[n],t[n],hi,r),i+=hi.near*hi.near,a+=hi.far*hi.far;return n.near=Math.min(1,Math.sqrt(i)),n.far=Math.min(1,Math.sqrt(a)),n}var _i=class{camera;stars;near;far;distances;radii;mix={near:0,far:0};muted=!0;constructor(e,t,n,r){this.camera=e,this.stars=t,this.distances=new Float64Array(t.length),this.radii=Float64Array.from(t,e=>e.radius);let i=t[0]?fi[t[0].data.kind]:1;this.near=t.length?n.ambient(`starNear`):null,this.far=t.length?n.ambient(`starFar`):null,this.near?.setRate(i),this.far?.setRate(i);let a=r.folder(`Star sound`);a?.add(di,`scale`,0,200),a?.add(di,`reach`,.5,30),a?.add(di,`nearFrom`,0,5),a?.add(di,`nearTo`,.5,15);let o=a?.addFolder(`Pitch per kind`).close();for(let e of Object.keys(fi))o?.add(fi,e,.5,2).onChange(()=>{let e=t[0]?fi[t[0].data.kind]:1;this.near?.setRate(e),this.far?.setRate(e)})}mute(e){this.muted=e,e&&(this.near?.setLevel(0),this.far?.setLevel(0))}update(){if(this.muted||!this.near||!this.far)return;let e=this.camera.position;for(let t=0;t<this.stars.length;t++)this.distances[t]=e.distanceTo(this.stars[t].renderPosition);gi(this.distances,this.radii,this.mix),this.near.setLevel(this.mix.near),this.far.setLevel(this.mix.far)}dispose(){this.near?.stop(),this.far?.stop()}},vi=.02,yi=class{camera;input;ship;bodies;sfx;sights;regions;hovered=null;raycaster=new nt;ndc=new D;point=new L;regionPoint=new L;best=null;bestDepth=1/0;constructor(e,t,n,r,i,a=[],o=[]){this.camera=e,this.input=t,this.ship=n,this.bodies=r,this.sfx=i,this.sights=a,this.regions=o}update(){let{pointer:e}=this.input,t=e.inside&&!this.input.isDragging&&!this.input.blocked;this.hovered=t?this.pick(e.ndcX,e.ndcY):null;let n=this.input.consumeClick();if(!n)return;let r=this.pick(n.ndcX,n.ndcY);if(r&&this.isBody(r))this.select(r);else if(r&&this.regions.includes(r)){let e=r.bodyNear(this.regionPoint);e&&this.select(e)}}select(e){this.sfx.play(`select`),this.ship.moveTo(e)}pick(e,t){this.raycaster.setFromCamera(this.ndc.set(e,t),this.camera),this.best=null,this.bestDepth=1/0;for(let e of this.bodies)this.test(e);for(let e of this.sights)this.test(e);if(this.best)return this.best;let n=1/0;for(let e of this.regions){let t=e.hit(this.raycaster.ray,this.point);t!==null&&t<n&&(n=t,this.best=e,this.regionPoint.copy(this.point))}return this.best}test(e){let{ray:t}=this.raycaster,n=e.renderPosition,r=t.direction.dot(this.point.subVectors(n,t.origin));if(r<=0||r>=this.bestDepth)return;let i=Math.max(e.pickRadius??e.radius,r*vi);t.distanceSqToPoint(n)<=i*i&&(this.best=e,this.bestDepth=r)}isBody(e){return this.bodies.includes(e)}dispose(){}},bi=class{camera;ship;ring;constructor(e,t,n){this.camera=t,this.ship=n,this.ring=new me(e,`#66ffcc`)}update(e){let{ship:t}=this,n=t.object.visible?t.object.scale.x:0;if(n<.01){this.ring.hide();return}let r=t.targetBody;this.ring.place(r.renderPosition,r.radius*1.45+1,(t.enRoute?.9:.35)*n,this.camera,e)}hide(){this.ring.hide()}dispose(){this.ring.dispose()}},xi=.1,Si=`Click: fly to a planet, moon, star or asteroid belt · Scroll: move in or out (in at a planet to descend, out past the system for the galaxy) · Drag: rotate view · Shift: boost · N: map · M: mute · Esc: menu`,Ci=`Tap: fly to a planet, moon, star or asteroid belt · Pinch: move in or out (in at a planet to descend, out past the system for the galaxy) · Drag: rotate view · Hold: identify · Boost · Map`,wi=class{ship;picker;map;input;system;tooltip;locationEl=document.getElementById(`hud-location`);speedEl=document.getElementById(`hud-speed`);targetEl=document.getElementById(`hud-target`);help;sinceRefresh=xi;active=!1;constructor(e,t,n,r,i,a){this.ship=e,this.picker=t,this.map=n,this.input=r,this.system=i,this.tooltip=a,this.help=new yt(r,Si,Ci)}activate(){this.active=!0;let{system:e}=this,t=e.planets.length===1?`1 planet`:`${e.planets.length} planets`,n=e.nebula?` · in the ${e.nebula.name}`:``,r=e.stars.length>0?`${xt(e.stars)} · ${t}`:`Rogue planet · no star`,i=e.dust?` · ${qe(e.dust)}`:``;this.locationEl.textContent=`${e.name} · ${r}${i}${n}`,this.help.refresh(!0),this.sinceRefresh=xi}deactivate(){this.active=!1,this.tooltip.hide()}update(e){if(!this.active)return;let{map:t}=this,n=t.pointerOver?t.hovered:this.picker.hovered;if(n){let{clientX:e,clientY:r}=t.pointerOver?t.pointer:this.input.pointer;this.tooltip.show(n,n.name,n.description,e,r,n.details,this.input.touchMode)}else this.tooltip.hide();if(this.sinceRefresh+=e,this.sinceRefresh<xi)return;this.sinceRefresh=0,this.help.refresh(),this.speedEl.textContent=`${this.ship.speed.toFixed(0)} u/s`;let r=this.ship.targetBody;this.targetEl.textContent=`${this.ship.enRoute?`Autopilot → `:`Hovering at `}${r.name}`}dispose(){this.tooltip.hide()}},Ti={gap:1.3,moonGap:.45,beltHalfWidth:.7,beltHalfHeight:1.6,minAsteroid:1.6,ringTilt:.3,maxScale:5,minPlanet:3,minMoon:1.8,sunFraction:.1,minSun:26,maxSun:64,padding:8,labelHeight:14,labelRowHeight:12,minHeight:84};function Ei(e){return Math.sqrt(Math.max(e,0))}function Di(e,t){let n=Ti,{width:r}=t,i=t.belts??[],a=t.stars.length>0?ji(r*n.sunFraction,n.minSun,n.maxSun):n.padding,o=[],s=e=>({planet:-1,belt:e,r:n.beltHalfHeight,ring:0,moons:i[e].asteroids.map(e=>Ei(e.radius))});i.forEach((e,t)=>e.after<0&&o.push(s(t))),e.forEach((e,t)=>{let n=Ei(e.radius);o.push({planet:t,belt:-1,r:n,ring:e.ringOuter?n*e.ringOuter/e.radius:0,moons:e.moons.map(e=>Ei(e.radius))}),i.forEach((e,n)=>e.after===t&&o.push(s(n)))});let c=o.map(e=>{let t=Math.max(e.belt>=0?n.beltHalfWidth:e.r,e.ring,...e.moons),r=Math.max(e.r,e.ring*n.ringTilt);return{half:t,above:e.moons.reduce((e,t)=>e+n.moonGap+2*t,r),below:r}}),l=c.reduce((e,t)=>e+2*t.half+n.gap,0),u=c.reduce((e,t)=>Math.max(e,t.above+t.below),0),d=r-a-n.padding,f=n.labelHeight+((t.labelRows??1)-1)*n.labelRowHeight,p=t.maxHeight-2*n.padding-f,m=Math.min(n.maxScale,l>0?d/l:n.maxScale,u>0?p/u:n.maxScale),h=o.map(e=>{let t=e.belt>=0,r=t?e.r*m:Math.max(e.r*m,n.minPlanet),i=e.ring*m,a=e.moons.map(e=>Math.max(e*m,t?n.minAsteroid:n.minMoon)),o=Math.max(t?n.beltHalfWidth*m:r,i,...a),s=Math.max(r,i*n.ringTilt);return{r,ring:i,moons:a,half:o,above:a.reduce((e,t)=>e+n.moonGap*m+2*t,s),below:s}}),g=h.reduce((e,t)=>Math.max(e,t.above),0),_=h.reduce((e,t)=>Math.max(e,t.below),0),v=g+_+f,y=Math.max(n.minHeight,Math.ceil(v+2*n.padding)),b=n.padding+g+(y-2*n.padding-v)/2,x=h.reduce((e,t)=>e+2*t.half,0),ee=h.length>0?(d-x)/h.length:0,te=a+ee/2,ne=[],re=Array(i.length);return h.forEach((e,t)=>{let r=te+e.half;te+=2*e.half+ee;let i=b-e.below,a=e.moons.map(e=>{i-=n.moonGap*m;let t=i-e;return i-=2*e,{x:r,y:t,r:e}}),s=o[t];s.belt>=0?re[s.belt]={x:r,halfWidth:n.beltHalfWidth*m,halfHeight:e.r,asteroids:a}:ne.push({x:r,y:b,r:e.r,ring:e.ring,moons:a})}),{width:r,height:y,axisY:b,sunEdge:a,stars:Oi(t.stars,a,y),planets:ne,belts:re,labelY:b+_+2}}function Oi(e,t,n){if(e.length===0)return[];if(e.length===1){let e=Math.max(n*1.15,t*2);return[{x:t-e,y:n/2,r:e}]}let r=Math.max(...e);return e.map((e,i)=>{let a=Math.max(n*.62,t*1.6)*Math.max(.6,Math.sqrt(e/r));return{x:t*(i===0?1:.8)-a,y:n*(i===0?.3:.76),r:a}})}function ki(e,t,n,r){let i=t,a=e.sunEdge,o=.1;for(let t=0;t<n.length;t++){let s=n[t],c=e.planets[t].x;if(o=(c-a)/Math.max(s-i,1e-6),r<=s)return a+Math.max(r-i,0)*o;i=s,a=c}return Math.min(e.width-Ai,a+Math.max(r-i,0)*o)}var Ai=6;function ji(e,t,n){return Math.min(n,Math.max(t,e))}function Mi(e,t){let n=[];return t.forEach((r,i)=>{let a=r.trojan?r.trojan.planet:e.filter(e=>e<r.inner).length-1,o=r.trojan?n.find(e=>e.after===a&&t[e.members[0]].trojan):void 0;o?o.members.push(i):n.push({after:a,members:[i]})}),n.sort((e,t)=>e.after-t.after)}function Ni(e,t){return e.map(e=>({after:e.after,asteroids:e.members.flatMap(e=>t[e].asteroids)}))}function Pi(e,t,n=4){let r=-1/0;return e.map((e,i)=>e-t[i]/2>=r+n?(r=e+t[i]/2,0):1)}var Fi=230,Ii=190,Li=3,Ri=1/30,zi=2,Bi=3,Vi=8,Hi=new L(-.8,.3,.55).normalize(),Ui=.3,Wi=`KeyN`,Gi=60,Ki=600,qi=`spore2.systemMap`,Ji=`#66ffcc`,Yi=`rgba(207, 227, 255, 0.6)`,Xi=class{data;stars;ship;picker;input;belts;hovered=null;pointerOver=!1;pointer={clientX:0,clientY:0};root=document.getElementById(`system-map`);title=document.getElementById(`system-map-title`);toggle=document.getElementById(`system-map-toggle`);canvas=document.getElementById(`system-map-canvas`);mapButton=document.getElementById(`touch-map`);discs=[];planetDiscs=[];beltGroups;beltColors;orbits;starColors;titleText;layout=null;labelRows=[];pixelRatio=1;layoutDirty=!0;active=!1;shown=!1;folded;open=!1;touchLayout=null;keyWasDown=!1;sinceDraw=Ri;rubble=new Map;bakeIndex=0;color=new S;srgb={r:0,g:0,b:0};constructor(e,t,n,r,i,a,o,s=[]){this.data=e,this.stars=t,this.ship=i,this.picker=a,this.input=o,this.belts=s;let c={x:0,y:0,r:0};for(let e of n){let t=this.createDisc(e,e.name.split(` `).pop()??``,c);this.discs.push(t),this.planetDiscs.push(t);for(let t of r)t.parent===e&&this.discs.push(this.createDisc(t,null,c))}this.beltGroups=Mi(e.planets.map(e=>e.orbit.radius),s.map(e=>e.data));for(let e of this.beltGroups)for(let t of e.members)for(let e of s[t].asteroids)this.discs.push(this.createDisc(e,null,c));this.beltColors=this.beltGroups.map(e=>{let t=s[e.members[0]].data;return t.icy?`rgba(200, 220, 255, 0.55)`:t.trojan?`rgba(220, 170, 140, 0.55)`:`rgba(225, 205, 175, 0.55)`}),this.orbits=e.planets.map(e=>e.orbit.radius),this.starColors=e.stars.map(e=>({glow:[ea(e.color,.55),ea(e.color,0)],rim:e.color,inner:ta(e.color,.55)})),this.folded=na();let l=(e,t,n)=>`${e} ${e===1?t:n}`;this.titleText=[e.name,l(n.length,`planet`,`planets`),...r.length>0?[l(r.length,`moon`,`moons`)]:[],...s.length>0?[l(this.beltGroups.length,`belt`,`belts`)]:[]].join(` · `)}get visible(){return this.shown&&!this.hidesBody}get baked(){return this.discs.every(e=>e.sprite!==null)}get currentLayout(){return this.layout}mapPosition(e){let t=this.stars.indexOf(e);if(t>=0&&this.layout){let e=this.layout.stars[t];return{x:this.layout.sunEdge/2,y:e.y}}let n=this.discs.find(t=>t.body===e);return n&&this.layout?{x:n.disc.x,y:n.disc.y}:null}get hidesBody(){return this.folded&&!this.input.touchMode}activate(){this.active=!0,this.title.textContent=this.titleText,this.open=!1,this.touchLayout=null,this.showFolded(),this.showOpen(),this.toggle.addEventListener(`click`,this.onToggle),this.mapButton.addEventListener(`click`,this.onMapButton),this.canvas.addEventListener(`click`,this.onClick),this.canvas.addEventListener(`pointermove`,this.onPointerMove),this.canvas.addEventListener(`pointerleave`,this.onPointerLeave),window.addEventListener(`resize`,this.onResize),this.layoutDirty=!0,this.sinceDraw=1/0}deactivate(){this.active&&(this.active=!1,this.setShown(!1),this.onPointerLeave(),this.toggle.removeEventListener(`click`,this.onToggle),this.mapButton.removeEventListener(`click`,this.onMapButton),this.canvas.removeEventListener(`click`,this.onClick),this.canvas.removeEventListener(`pointermove`,this.onPointerMove),this.canvas.removeEventListener(`pointerleave`,this.onPointerLeave),window.removeEventListener(`resize`,this.onResize))}update(e){if(!this.active)return;let t=this.input.isDown(Wi);t&&!this.keyWasDown&&this.setFolded(!this.folded),this.keyWasDown=t;let n=this.input.touchMode;n!==this.touchLayout&&(this.touchLayout=n,this.layoutDirty=!0,this.showFolded()),this.setShown((!n||this.open)&&!this.input.blocked),this.visible&&(this.layoutDirty&&this.measure(),this.bake(),this.sinceDraw+=e,this.sinceDraw>=Ri&&(this.sinceDraw=0,this.draw()))}dispose(){this.deactivate()}createDisc(e,t,n){let{config:r}=e,i=an(r)?r.bands[Math.floor(r.bands.length/2)]:r.style.sea??r.style.low,{rings:a,atmosphere:o}=r;return{body:e,label:t,disc:{...n},ring:0,sprite:null,image:null,rows:0,fill:i,ringStyle:a?ea(a.color,a.opacity):``,halo:o&&r.climate?[ea(o,.55),ea(o,0)]:null}}labelFont(){return`600 ${this.input.touchMode?12:10}px system-ui, sans-serif`}measure(){let e=this.canvas.clientWidth;if(e<=0)return;this.layoutDirty=!1;let t=this.input.touchMode?Math.max(120,window.innerHeight-Ii):Fi,n=n=>Di(this.data.planets.map(e=>({radius:e.radius,ringOuter:e.rings?.outer??null,moons:e.moons.map(e=>({radius:e.radius}))})),{width:e,maxHeight:t,stars:this.data.stars.map(e=>e.radius),belts:Ni(this.beltGroups,this.belts.map(e=>e.data)),labelRows:n}),r=n(1),i=this.canvas.getContext(`2d`);i.font=this.labelFont(),this.labelRows=Pi(r.planets.map(e=>e.x),this.planetDiscs.map(e=>i.measureText(e.label??``).width)),this.labelRows.some(e=>e>0)&&(r=n(2)),this.layout=r;let a=0,o=[...r.planets.map(e=>[e,...e.moons]),...r.belts.map(e=>e.asteroids)];for(let e of o)for(let t of e){let e=this.discs[a++],n=e.disc.r;e.disc.x=t.x,e.disc.y=t.y,e.disc.r=t.r,e.ring=`ring`in t?t.ring:0,Math.abs(n-t.r)>.25&&(e.image=null,e.rows=0,this.bakeIndex=0)}this.pixelRatio=Math.min(window.devicePixelRatio||1,zi),this.canvas.width=Math.round(e*this.pixelRatio),this.canvas.height=Math.round(r.height*this.pixelRatio),this.canvas.style.height=`${r.height}px`,this.sinceDraw=1/0}bake(){if(!this.layout)return;let e=performance.now();for(;this.bakeIndex<this.discs.length&&performance.now()-e<Li;){let t=this.discs[this.bakeIndex];if(t.sprite&&!t.image&&t.rows>0){this.bakeIndex++;continue}let n=Math.max(2,Math.ceil(2*t.disc.r*this.pixelRatio)+2);t.image||(t.image=new ImageData(n,n),t.rows=0);let{config:r}=t.body,i=an(r)?Lt(r.seed,r.bands,r.size===`iceGiant`):null,a=i?null:se(r.style,!1,r.seed),o=r.tilt??0,s=Math.cos(o),c=Math.sin(o),l=t.image,u=n/2,d=u-1;for(;t.rows<n&&performance.now()-e<Li;){let e=t.rows++;for(let t=0;t<n;t++){let o=(t+.5-u)/d,f=(u-e-.5)/d,p=o*o+f*f,m=k.clamp((1-Math.sqrt(p))*d+.5,0,1);if(m<=0)continue;let h=Math.sqrt(Math.max(0,1-p)),g=o*s+f*c,_=-o*c+f*s;i?i(g,_,h,this.color):a(He(g,_,h,r.seed),this.color,g,_,h);let v=Math.max(0,o*Hi.x+f*Hi.y+h*Hi.z);this.color.multiplyScalar(Ui+.7*v),this.color.getRGB(this.srgb,Tt);let y=(e*n+t)*4;l.data[y]=Math.round(k.clamp(this.srgb.r,0,1)*255),l.data[y+1]=Math.round(k.clamp(this.srgb.g,0,1)*255),l.data[y+2]=Math.round(k.clamp(this.srgb.b,0,1)*255),l.data[y+3]=Math.round(m*255)}}if(t.rows<n)return;let f=document.createElement(`canvas`);f.width=f.height=n,f.getContext(`2d`).putImageData(l,0,0),t.sprite=f,t.image=null,this.sinceDraw=1/0,this.bakeIndex++}}draw(){let e=this.layout;if(!e)return;let t=this.canvas.getContext(`2d`);t.setTransform(this.pixelRatio,0,0,this.pixelRatio,0,0),t.clearRect(0,0,e.width,e.height);let n=e.planets[e.planets.length-1];n&&(t.beginPath(),t.moveTo(e.sunEdge,e.axisY),t.lineTo(n.x,e.axisY),t.strokeStyle=`rgba(207, 227, 255, 0.12)`,t.lineWidth=1,t.stroke()),this.starColors.forEach((n,r)=>this.drawStar(t,e.stars[r],n)),e.belts.forEach((n,r)=>this.drawBelt(t,n.x,e.axisY,n.halfWidth,n.halfHeight,r));for(let e of this.discs)this.drawBody(t,e);t.font=this.labelFont(),t.textAlign=`center`,t.textBaseline=`top`,t.fillStyle=Yi,this.planetDiscs.forEach((n,r)=>t.fillText(n.label??``,n.disc.x,e.labelY+(this.labelRows[r]??0)*Ti.labelRowHeight)),this.discs.length===0&&(t.textAlign=`left`,t.textBaseline=`middle`,t.fillText(`No planets`,e.sunEdge+16,e.axisY));let r=this.hovered??this.picker.hovered,i=r?this.markAt(r):null;i&&(t.beginPath(),t.arc(i.x,i.y,i.r+3,0,Math.PI*2),t.strokeStyle=`rgba(255, 255, 255, 0.75)`,t.lineWidth=1.5,t.stroke());let a=this.ship,o=a.targetBody,s=a.enRoute?null:this.markAt(o);if(a.enRoute){let e=this.markAt(o);e&&(t.beginPath(),t.arc(e.x,e.y,e.r+4,0,Math.PI*2),t.setLineDash([3,3]),t.strokeStyle=Ji,t.lineWidth=1.5,t.stroke(),t.setLineDash([]))}let c=s?s.x+s.r*.7+4:this.data.stars.length===0?e.planets[0]?.x??e.sunEdge:ki(e,this.data.starZone,this.orbits,a.object.position.length()),l=s?s.y-s.r*.7-4:e.axisY,u=performance.now()/1e3%1.4;t.beginPath(),t.arc(c,l,4+8*u,0,Math.PI*2),t.strokeStyle=`rgba(255, 255, 255, ${.8*(1-u/1.4)})`,t.lineWidth=1.5,t.stroke(),Qi(t,c,l)}drawBelt(e,t,n,r,i,a){e.fillStyle=this.beltColors[a];let o=Math.round(10+r*i*.6);for(let s=0;s<o;s++){let o=$i(Math.sin((a+1)*12.9898+s*78.233)*43758.5453),c=$i(Math.sin((a+1)*39.3468+s*11.135)*24634.6345),l=$i(Math.sin((a+1)*73.156+s*52.235)*12345.6789);e.beginPath(),e.arc(t+(o*2-1)*r,n+(c*2-1)*i,.5+l,0,Math.PI*2),e.fill()}}drawStar(e,t,n){let r=e.createRadialGradient(t.x,t.y,t.r*.95,t.x,t.y,t.r+22);r.addColorStop(0,n.glow[0]),r.addColorStop(1,n.glow[1]),e.fillStyle=r,e.beginPath(),e.arc(t.x,t.y,t.r+22,0,Math.PI*2),e.fill();let i=e.createRadialGradient(t.x,t.y,t.r*.6,t.x,t.y,t.r);i.addColorStop(0,`#ffffff`),i.addColorStop(.75,n.inner),i.addColorStop(1,n.rim),e.fillStyle=i,e.beginPath(),e.arc(t.x,t.y,t.r,0,Math.PI*2),e.fill()}drawBody(e,t){let{x:n,y:r,r:i}=t.disc,{config:a}=t.body;if(t.body.busted){this.drawRubble(e,t);return}let o=a.rings,s=a.tilt??0,c=o?t.ring*o.inner/o.outer:0;if(o&&t.ring>0&&Zi(e,n,r,t.ring,c,s,!1,t.ringStyle),t.halo){let a=e.createRadialGradient(n,r,i*.9,n,r,i*1.35+1);a.addColorStop(0,t.halo[0]),a.addColorStop(1,t.halo[1]),e.fillStyle=a,e.beginPath(),e.arc(n,r,i*1.35+1,0,Math.PI*2),e.fill()}if(t.sprite){let a=1/this.pixelRatio;e.drawImage(t.sprite,n-i-a,r-i-a,2*(i+a),2*(i+a))}else e.beginPath(),e.arc(n,r,i,0,Math.PI*2),e.fillStyle=t.fill,e.fill();o&&t.ring>0&&Zi(e,n,r,t.ring,c,s,!0,t.ringStyle)}drawRubble(e,t){let{x:n,y:r,r:i}=t.disc,{config:a}=t.body,o=this.rubble.get(t.body);if(!o){let e=Le(a.style,a.bands).map(e=>`#${new S(e).multiplyScalar(1.3).getHexString()}`),n={x:0,y:0,z:0};o=Pe(a.seed,Gi,0).chunks.map(t=>(re(t,Ki,n),{x:n.x/s,y:n.y/s,size:t.size/s,color:e[t.shade]})),this.rubble.set(t.body,o)}for(let t of o)e.fillStyle=t.color,e.beginPath(),e.arc(n+t.x*i,r-t.y*i,Math.max(.7,t.size*i*1.6),0,Math.PI*2),e.fill()}markAt(e){let t=this.layout,n=this.stars.indexOf(e);if(n>=0){let e=t.stars[n];return{x:t.sunEdge*.6,y:e.y,r:6}}return this.discs.find(t=>t.body===e)?.disc??null}bodyAt(e,t){let n=this.layout;if(!n)return null;let r=null,i=1/0;for(let n of this.discs){let a=Math.hypot(e-n.disc.x,t-n.disc.y);a<=Math.max(n.disc.r+Bi,Vi)&&a<i&&(r=n.body,i=a)}if(r)return r;if(e>n.sunEdge+Bi)return null;let a=1/0;return n.stars.forEach((n,i)=>{let o=Math.hypot(e-n.x,t-n.y)-n.r;o<a&&(a=o,r=this.stars[i]??null)}),r}setShown(e){e!==this.shown&&(this.shown=e,this.root.hidden=!e,this.layoutDirty=!0,this.sinceDraw=1/0,e||this.onPointerLeave())}setOpen(e){this.open=e,this.showOpen()}showOpen(){this.mapButton.classList.toggle(`active`,this.open),this.mapButton.setAttribute(`aria-expanded`,String(this.open))}setFolded(e){this.folded=e,ra(e),this.showFolded(),this.layoutDirty=!0}showFolded(){this.root.classList.toggle(`folded`,this.folded);let e=this.input.touchMode?`Close map`:this.folded?`Show map (N)`:`Hide map (N)`;this.toggle.setAttribute(`aria-expanded`,String(!this.hidesBody)),this.toggle.setAttribute(`aria-label`,e),this.toggle.title=e}onToggle=()=>{this.input.touchMode?this.setOpen(!1):this.setFolded(!this.folded)};onMapButton=()=>{this.input.blocked||this.setOpen(!this.open)};onResize=()=>{this.layoutDirty=!0};onPointerMove=e=>{if(e.pointerType!==`mouse`)return;let t=this.canvas.getBoundingClientRect();this.pointerOver=!0,this.pointer.clientX=e.clientX,this.pointer.clientY=e.clientY,this.hovered=this.input.blocked?null:this.bodyAt(e.clientX-t.left,e.clientY-t.top),this.canvas.style.cursor=this.hovered?`pointer`:``};onPointerLeave=()=>{this.pointerOver=!1,this.hovered=null,this.canvas.style.cursor=``};onClick=e=>{if(this.input.blocked)return;let t=this.canvas.getBoundingClientRect(),n=this.bodyAt(e.clientX-t.left,e.clientY-t.top);n&&this.picker.select(n)}};function Zi(e,t,n,r,i,a,o,s){let c=Ti.ringTilt;e.save(),e.translate(t,n),e.rotate(-a),e.beginPath(),e.rect(-r-1,o?0:-r-1,2*r+2,r+1),e.clip(),e.beginPath(),e.ellipse(0,0,r,r*c,0,0,Math.PI*2),e.ellipse(0,0,i,i*c,0,0,Math.PI*2),e.fillStyle=s,e.fill(`evenodd`),e.restore()}function Qi(e,t,n){e.beginPath(),e.ellipse(t,n-1.5,2.6,2.6,0,Math.PI,Math.PI*2),e.ellipse(t,n+.5,6,2.2,0,0,Math.PI*2),e.fillStyle=`#ffffff`,e.strokeStyle=`rgba(0, 0, 0, 0.8)`,e.lineWidth=1.5,e.stroke(),e.fill()}function $i(e){return e-Math.floor(e)}function ea(e,t){let n=new S(e),r={r:0,g:0,b:0};return n.getRGB(r,Tt),`rgba(${Math.round(r.r*255)}, ${Math.round(r.g*255)}, ${Math.round(r.b*255)}, ${t})`}function ta(e,t){return`#${new S(e).lerp(new S(`#ffffff`),t).getHexString()}`}function na(){try{return localStorage.getItem(qi)===`folded`}catch{return!1}}function ra(e){try{localStorage.setItem(qi,e?`folded`:`open`)}catch{}}var W={brightness:.22,bulge:.3,dust:.8,stars:1},ia=3500,aa=512,oa=class{scene;sky;sphere;stars;bakeScene=new pt;bakeMaterial;target=new r(aa,{generateMipmaps:!1});cubeCamera=new Te(.1,10,this.target);baked=!1;constructor(e,t,n,r,i){this.scene=e;let o=this.sky=a(t.position,n.galacticTilt),s=e=>new L(e.x,e.y,e.z),c=s(o.north),l=new S(Hn).lerp(new S(`#ffffff`),.35),u=new Ge(1,64,32);this.bakeMaterial=new A({uniforms:{north:{value:c},center:{value:s(o.center)},east:{value:s(o.east)},band:{value:o.band.map(e=>new L(e.brightness,e.width,e.offset))},bulgeLat:{value:Math.asin(k.clamp(c.dot(s(o.bulge)),-1,1))},bulgeSize:{value:o.bulgeSize},discColor:{value:l},bulgeColor:{value:new S(Un)},brightness:{value:W.brightness},bulgeBrightness:{value:W.bulge},dust:{value:W.dust},seed:{value:R(n.seed,`band`)%1e3/10}},vertexShader:sa,fragmentShader:ca,side:1,blending:0,depthTest:!1,depthWrite:!1}),this.bakeScene.add(new P(u,this.bakeMaterial)),this.target.texture.colorSpace=Tt,this.sphere=new P(u,new A({uniforms:{map:{value:this.target.texture}},vertexShader:sa,fragmentShader:`
          uniform samplerCube map;
          varying vec3 vDir;
          void main() {
            gl_FragColor = textureCube(map, vDir);
            #include <colorspace_fragment>
          }`,side:1,blending:2,depthTest:!1,depthWrite:!1})),this.sphere.onBeforeRender=e=>{this.baked||(this.baked=!0,this.cubeCamera.update(e,this.bakeScene))},this.sphere.name=`Galaxy band`,this.sphere.frustumCulled=!1,this.sphere.renderOrder=-3,e.add(this.sphere);let d=new Ze(R(n.seed,`bandStars`)),f=nn(o,d,ia),p=new Float32Array(ia*3),m=new Float32Array(ia),h=new S,g=new L;for(let e=0;e<ia;e++)h.setHSL(d.chance(.6)?.1:.6,d.range(0,.4),1).multiplyScalar(d.range(.05,.3)),i&&h.multiplyScalar(i(g.fromArray(f,e*3))),h.toArray(p,e*3),m[e]=d.range(1,2.2);let _=new w;_.setAttribute(`position`,new C(f,3)),_.setAttribute(`color`,new C(p,3)),_.setAttribute(`size`,new C(m,1));let v=new A({uniforms:{pixelRatio:{value:1},brightness:{value:W.stars}},vertexShader:la,fragmentShader:ua,blending:2,depthTest:!1,depthWrite:!1});this.stars=new $e(_,v),this.stars.name=`Galaxy band stars`,this.stars.frustumCulled=!1,this.stars.renderOrder=-2,this.stars.onBeforeRender=e=>{v.uniforms.pixelRatio.value=e.getPixelRatio()},e.add(this.stars);let y=r.folder(`Galaxy band`);if(y){let e=this.bakeMaterial.uniforms,t=t=>n=>{e[t].value=n,this.baked=!1};y.add(W,`brightness`,0,1).onChange(t(`brightness`)),y.add(W,`bulge`,0,1).onChange(t(`bulgeBrightness`)),y.add(W,`dust`,0,1).onChange(t(`dust`)),y.add(W,`stars`,0,3).onChange(e=>v.uniforms.brightness.value=e)}}dispose(){this.scene.remove(this.sphere,this.stars),this.sphere.geometry.dispose(),this.sphere.material.dispose(),this.bakeMaterial.dispose(),this.target.dispose(),this.stars.geometry.dispose(),this.stars.material.dispose()}},sa=`
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = (projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0)).xyww;
  }`,ca=`
  #define PI 3.14159265
  #define N 64
  uniform vec3 north;
  uniform vec3 center;
  uniform vec3 east;
  // Per longitude sample: brightness, width (σ of latitude), offset of the midline.
  uniform vec3 band[N];
  uniform float bulgeLat;
  uniform float bulgeSize;
  uniform vec3 discColor;
  uniform vec3 bulgeColor;
  uniform float brightness;
  uniform float bulgeBrightness;
  uniform float dust;
  uniform float seed;
  varying vec3 vDir;

  ${n}

  void main() {
    vec3 v = normalize(vDir);
    float lat = asin(clamp(dot(v, north), -1.0, 1.0));
    float lon = atan(dot(v, east), dot(v, center));

    float f = mod(lon, 2.0 * PI) / (2.0 * PI) * float(N);
    int i0 = int(mod(floor(f), float(N)));
    vec3 s = mix(band[i0], band[(i0 + 1) % N], fract(f));

    float y = (lat - s.z) / s.y;
    float disc = brightness * pow(s.x, 0.8) * exp(-0.5 * y * y);
    float bx = lon * cos(lat) / bulgeSize;
    float by = (lat - bulgeLat) / (bulgeSize * ${we.toFixed(2)});
    float bulge = bulgeBrightness * exp(-0.5 * (bx * bx + by * by));
    float total = disc + bulge;
    vec3 color = mix(discColor, bulgeColor, bulge / max(total, 1e-6));

    // Star clouds and dust lanes fade in where the band is bright enough to
    // show them; the faint outskirts are the smooth glow alone, which saves
    // the noise over most of the sky without leaving an edge.
    float detail = smoothstep(0.004, 0.015, total);
    if (detail > 0.0) {
      // Noise coordinates running along the band (continuous all the way round),
      // finer across it, so clouds and lanes are drawn out along the plane.
      vec3 q = vec3(cos(lon) * 2.5, sin(lon) * 2.5, lat * 9.0) + seed;
      float clouds = fbm(q * 1.7, 5);
      float lanes = smoothstep(0.42, 0.62, fbm(q + 7.3, 5));
      // The lanes hug the midline, like the Great Rift.
      float y2 = y / 0.6;
      float mid = exp(-0.5 * y2 * y2);
      total *= mix(1.0, (0.55 + 0.9 * clouds) * (1.0 - dust * lanes * mid), detail);
    }

    gl_FragColor = vec4(color * total, 1.0);
    #include <colorspace_fragment>
  }`,la=`
  attribute vec3 color;
  attribute float size;
  uniform float pixelRatio;
  varying vec3 vColor;
  void main() {
    vColor = color;
    gl_Position = (projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0)).xyww;
    gl_PointSize = size * pixelRatio;
  }`,ua=`
  uniform float brightness;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    gl_FragColor = vec4(vColor * brightness * (1.0 - d * d), 1.0);
    #include <colorspace_fragment>
  }`,da=.04,fa=.5,pa=256,ma=48,ha=256,ga=1024,_a=class{scene;nebulas;wide;detail;sphere;baked=!1;static near(e,t){let n=e=>Math.hypot(e.position.x-t.x,e.position.y-t.y,e.position.z-t.z);return e.filter(e=>va(e,t)>=da).sort((e,t)=>n(e)-n(t))}constructor(e,t,n,r,i){this.scene=e,this.nebulas=r;let a=mt(n.galacticTilt),o=new F(a.x,a.y,a.z,a.w),s=e=>va(e,t.position),c=r.filter(e=>s(e)>=fa),l=r.filter(e=>s(e)<fa);this.wide=c.length>0?new lr(c,t.position,o,pa):null,this.detail=l.length>0?new lr(l,t.position,o,ya(Math.min(...l.map(s)))):null;let u={};this.wide&&(u.WIDE=1),this.detail&&(u.DETAIL=1),this.sphere=new P(new Ge(1,32,16),new A({defines:u,uniforms:{wide:{value:this.wide?.texture??null},detail:{value:this.detail?.texture??null}},vertexShader:`
          varying vec3 vDir;
          void main() {
            vDir = position;
            gl_Position = (projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0)).xyww;
          }`,fragmentShader:`
          uniform samplerCube wide;
          uniform samplerCube detail;
          varying vec3 vDir;
          void main() {
            // Each is light (sRGB) and transmittance; the small ones are seen through the big.
            vec4 sky = vec4(0.0, 0.0, 0.0, 1.0);
            #ifdef DETAIL
              sky = textureCube(detail, vDir);
            #endif
            #ifdef WIDE
              vec4 front = textureCube(wide, vDir);
              sky = vec4(front.rgb + sky.rgb * front.a, sky.a * front.a);
            #endif
            gl_FragColor = sky;
            #include <colorspace_fragment>
          }`,side:1,blending:5,blendEquation:100,blendSrc:201,blendDst:204,blendSrcAlpha:200,blendDstAlpha:201,transparent:!1,depthTest:!1,depthWrite:!1})),this.sphere.onBeforeRender=e=>{this.baked||(this.baked=!0,this.wide?.bake(e),this.detail?.bake(e))},this.sphere.name=`Nebula sky`,this.sphere.frustumCulled=!1,this.sphere.renderOrder=-2.5,e.add(this.sphere),ar(i,`System nebulas`,()=>this.baked=!1)}get visible(){return this.sphere.visible}set visible(e){this.sphere.visible=e}get ready(){return this.baked}stats(e){let t=this.wide?.stats(e)??{light:0,transmittance:1},n=this.detail?.stats(e)??{light:0,transmittance:1};return{light:t.light+n.light,transmittance:t.transmittance*n.transmittance}}get bakeSizes(){return{wide:this.wide?.size??0,detail:this.detail?.size??0}}dispose(){this.scene.remove(this.sphere),this.sphere.geometry.dispose(),this.sphere.material.dispose(),this.wide?.dispose(),this.detail?.dispose()}};function va(e,t){let n=Math.hypot(e.position.x-t.x,e.position.y-t.y,e.position.z-t.z);return n<=e.radius?Math.PI/2:Math.asin(e.radius/n)}function ya(e){let t=e/ma,n=2**Math.ceil(Math.log2(Math.PI/2/t));return Math.min(ga,Math.max(ha,n))}function ba(e,t,n){let r=e.filter(Pt);if(r.length===0)return null;let i={x:0,y:0,z:0};return e=>Et(r,t,dt(n.galacticTilt,e,i))}var G={length:.35,opacity:.35,highlight:.7,moonOpacity:.3,headWidth:1.2,tailWidth:4,minPixels:3,nearFade:40,endOn:.5,moonRange:5},xa=128,Sa=10,Ca=`#b4c2de`,wa=.35,Ta=class{scene;camera;highlighted;root=new E;geometry=Ea(xa);planetTrails;moonTrails;shared={time:{value:0},minWidth:{value:0},nearFade:{value:G.nearFade},endOn:{value:G.endOn},span:{value:G.length*Math.PI*2}};scratch=new L;constructor(e,t,n,r,i,a){this.scene=e,this.camera=t,this.highlighted=i,this.root.name=`Orbit trails`,this.planetTrails=n.map(e=>this.createTrail(e)),this.moonTrails=r.map(e=>this.createTrail(e)),e.add(this.root);let o=a.folder(`Orbit trails`);o?.add(G,`length`,.05,1),o?.add(G,`opacity`,0,1),o?.add(G,`highlight`,0,1),o?.add(G,`moonOpacity`,0,1),o?.add(G,`headWidth`,.1,4),o?.add(G,`tailWidth`,.1,10),o?.add(G,`minPixels`,0,10),o?.add(G,`nearFade`,0,200),o?.add(G,`endOn`,0,1),o?.add(G,`moonRange`,1,20),o?.add(this.root,`visible`).name(`show`)}set visible(e){this.root.visible=e}get visible(){return this.root.visible}get visibleCount(){let e=0;for(let t of[...this.planetTrails,...this.moonTrails])t.mesh.visible&&e++;return e}get count(){return this.planetTrails.length+this.moonTrails.length}update(e){let t=G,n=this.shared;n.time.value+=e,n.nearFade.value=t.nearFade,n.endOn.value=t.endOn,n.span.value=t.length*Math.PI*2,n.minWidth.value=t.minPixels*2*Math.tan(k.degToRad(this.camera.fov)/2)/innerHeight;let r=1-Math.exp(-8*e);for(let e of this.planetTrails)this.place(e,e.body.renderPosition),this.ease(e,this.highlighted(e.body)?t.highlight:t.opacity,r);for(let e of this.moonTrails){let n=e.body.parent;e.mesh.position.copy(n.renderPosition),this.place(e,this.scratch.subVectors(e.body.renderPosition,n.renderPosition));let i=n.standoff*t.moonRange,a=this.camera.position.distanceTo(n.renderPosition),o=1-k.smoothstep(a,i,i*2);this.ease(e,this.highlighted(e.body)?t.highlight:t.moonOpacity*o,r)}}dispose(){this.scene.remove(this.root),this.geometry.dispose();for(let{mesh:e}of[...this.planetTrails,...this.moonTrails])e.material.dispose()}place(e,t){let n=e.mesh.material.uniforms;n.angle.value=ee(e.body.config.orbit,t),n.headWidth.value=e.body.radius*G.headWidth,n.tailWidth.value=e.body.radius*G.tailWidth}ease(e,t,n){e.opacity+=(t-e.opacity)*n,e.mesh.material.uniforms.opacity.value=e.opacity,e.mesh.visible=e.opacity>.003}createTrail(e){let{config:t}=e,n=t.atmosphere??(an(t)?t.bands[t.bands.length>>1]:t.style.high),r=Math.max(e.radius,t.rings?.outer??0),i=new A({uniforms:{...this.shared,color:{value:new S(Ca).lerp(new S(n),wa)},opacity:{value:0},angle:{value:0},radius:{value:t.orbit.radius},inclination:{value:t.orbit.inclination},node:{value:t.orbit.node??0},headWidth:{value:1},tailWidth:{value:1},body:{value:e.renderPosition},reach:{value:r},seed:{value:t.seed%1e3*.37}},vertexShader:Da,fragmentShader:Oa,side:2,blending:2,transparent:!0,depthWrite:!1}),a=new P(this.geometry,i);return a.name=`${e.name} trail`,a.frustumCulled=!1,a.visible=!1,this.root.add(a),{body:e,mesh:a,opacity:0}}};function Ea(e){let t=new Float32Array((e+1)*2*2),n=[];for(let r=0;r<=e;r++){let i=r/e;if(t.set([i,-1,i,1],r*4),r<e){let e=r*2;n.push(e,e+1,e+2,e+1,e+3,e+2)}}let r=new w;return r.setAttribute(`trail`,new C(t,2)),r.setAttribute(`position`,new C(new Float32Array((e+1)*2*3),3)),r.setIndex(n),r}var Da=`
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
    float segment = span / ${xa}.0;
    vec3 before = acrossAt(a + segment);
    vec3 after = acrossAt(a - segment);
    float turn = min(dot(side, before / max(length(before), 1e-6)), dot(side, after / max(length(after), 1e-6)));
    vSteady = smoothstep(${Math.cos(k.degToRad(Sa)).toFixed(4)}, ${Math.cos(k.degToRad(Sa/3)).toFixed(4)}, turn);
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
  }`,Oa=`
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
  ${n}

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
  }`,K={brightness:1.4,contrast:.4},ka=1/900,Aa=.05,ja=2.5,Ma=5,Na=.5,Pa=1400,Fa=.7,Ia=class{scene;points;constructor(e,t,n,r,i,a){this.scene=e;let o=Fe(t,n,r.galacticTilt),s=ka*Aa**(1/K.contrast),c=o.filter(e=>e.flux>=s);c.push(...Ra(new Ze(R(r.seed,`fieldStars`)),t,s));let l=new Float32Array(c.length*3),u=new Float32Array(c.length*3),d=new Float32Array(c.length),f=new S,p=new L;c.forEach((e,t)=>{p.set(e.dir.x,e.dir.y,e.dir.z).toArray(l,t*3),f.set(e.color).lerp(La,Na),a&&f.multiplyScalar(a(p)),f.toArray(u,t*3),d[t]=e.flux/ka});let m=new w;m.setAttribute(`position`,new C(l,3)),m.setAttribute(`color`,new C(u,3)),m.setAttribute(`flux`,new C(d,1));let h=new A({uniforms:{pixelRatio:{value:1},brightness:{value:K.brightness},contrast:{value:K.contrast},baseSize:{value:ja},growth:{value:Ma}},vertexShader:za,fragmentShader:Ba,blending:2,depthTest:!1,depthWrite:!1});this.points=new $e(m,h),this.points.name=`Sky stars`,this.points.frustumCulled=!1,this.points.renderOrder=-2,this.points.onBeforeRender=e=>{h.uniforms.pixelRatio.value=e.getPixelRatio(),h.uniforms.brightness.value=K.brightness,h.uniforms.contrast.value=K.contrast},e.add(this.points);let g=i.folder(`Sky stars`);g?.add(K,`brightness`,0,3),g?.add(K,`contrast`,.1,1)}get count(){return this.points.geometry.getAttribute(`position`).count}dispose(){this.scene.remove(this.points),this.points.geometry.dispose(),this.points.material.dispose()}},La=new S(1,1,1);function Ra(e,t,n){let r=ka*Fa**(1/K.contrast),i=[];for(let a=0;a<Pa;a++){let a=e.range(-1,1),o=e.range(0,2*Math.PI),s=Math.sqrt(1-a*a),c=Math.min(r,n*(1-e.next())**(-2/3)),l=t[e.int(0,t.length-1)]?.stars[0]?.color??`#ffffff`;i.push({dir:{x:s*Math.cos(o),y:s*Math.sin(o),z:a},flux:c,color:l})}return i}var za=`
  attribute vec3 color;
  attribute float flux;     // relative to the reference flux
  uniform float pixelRatio;
  uniform float brightness;
  uniform float contrast;
  uniform float baseSize;
  uniform float growth;
  varying vec3 vColor;
  varying float vSize;
  varying float vGlow;
  void main() {
    float b = brightness * pow(flux, contrast);
    // Past full brightness a star grows instead (its glow spreads, as in a photo).
    vGlow = clamp(b - 1.0, 0.0, 2.0);
    vColor = color * min(b, 1.0);
    vSize = (baseSize + growth * vGlow) * pixelRatio;
    gl_Position = (projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0)).xyww;
    gl_PointSize = vSize;
  }`,Ba=`
  varying vec3 vColor;
  varying float vSize;
  varying float vGlow;
  void main() {
    // Distance from the centre in device pixels.
    float px = length(gl_PointCoord - 0.5) * vSize;
    float edge = 0.5 * vSize;
    if (px > edge) discard;
    // A sharp core about a pixel wide, and round bright stars a glow fading to nothing at the point's edge.
    float core = exp(-px * px * 1.4);
    float glow = vGlow * 0.35 * exp(-px / (0.18 * edge + 0.5)) * (1.0 - px / edge);
    // The core of a bright star saturates to white.
    vec3 col = vColor * (core + glow) + vec3(core * vGlow * 0.3);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`,q={stream:.015,fresh:.35,reach:.1,nearFade:60},Va=720,Ha=`
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
`,Ua=`
  uniform vec3 uColor;
  varying float vBrightness;
  void main() {
    gl_FragColor = vec4(uColor * vBrightness, 1.0);
    #include <colorspace_fragment>
  }
`,Wa=class{scene;data;line;uniforms;constructor(e,t,n){this.scene=e,this.data=t;let{orbit:r}=t,i=new Float32Array(Va*3),a=new Float32Array(Va),o=new L,s={...r,phase:0};for(let e=0;e<Va;e++){let t=2*Math.PI*e/Va,n=t-r.eccentricity*Math.sin(t);Re(s,n/(2*Math.PI)*r.period,o),i.set([o.x,o.y,o.z],e*3),a[e]=n}let c=new w;c.setAttribute(`position`,new C(i,3)),c.setAttribute(`aAnomaly`,new C(a,1)),this.uniforms={uComet:{value:0},uHabitable:{value:n},uStream:{value:q.stream},uFresh:{value:q.fresh},uReach:{value:q.reach},uNearFade:{value:q.nearFade},uColor:{value:new S(t.dustColor)}},this.line=new Ue(c,new A({vertexShader:Ha,fragmentShader:Ua,uniforms:this.uniforms,blending:2,depthWrite:!1,transparent:!0})),this.line.name=`${t.name} dust trail`,this.line.frustumCulled=!1,e.add(this.line)}animate(e){let{orbit:t}=this.data,n=this.uniforms;n.uComet.value=t.phase+2*Math.PI*e/t.period,n.uStream.value=q.stream,n.uFresh.value=q.fresh,n.uReach.value=q.reach,n.uNearFade.value=q.nearFade}update(){}dispose(){this.scene.remove(this.line),this.line.geometry.dispose(),this.line.material.dispose()}};function Ga(e){let t=e.folder(`Comet dust trails`);t?.add(q,`stream`,0,.5),t?.add(q,`fresh`,0,2),t?.add(q,`reach`,.005,.3),t?.add(q,`nearFade`,0,300)}function Ka(e,t,n){let r=new Uint8Array(t*n),i=e%1e3/97;for(let e=0;e<n;e++){let a=(e+.5)/n;for(let n=0;n<t;n++){let o=2*Math.PI*(n+.5)/t,s=lt(Math.cos(o)*3,Math.sin(o)*3,a*5+i,3),c=lt(Math.cos(o)*11,Math.sin(o)*11,a*19+i*1.7,2),l=.45+1.1*s*(.6+.8*c);r[e*t+n]=Math.round(255*Math.min(2,l)/2)}}return r}var J={discBrightness:1.1,debrisBrightness:.15,lightPower:.35,forward:.45,debrisForward:.3,debrisSlantCap:.4,maxLight:2,midplane:.3,tauPower:.5,slantCap:.15,contrast:.6,debrisBandDepth:.6,clumps:.55,near:30,far:260},qa=[-.7,0,.7],Ja=[-.5,0,.5],Ya=[512,128],Xa=96,Za=100,Qa=`
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
`,$a=`
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
`,eo=1.3,to=[96,16],no=`
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
`,ro=`
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
    float alpha = (1.0 - exp(-tau)) * fade * (1.0 - smoothstep(1.0, ${eo.toFixed(1)}, abs(s)));
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
`,io=class{scene;data;object=new E;geometry;sheets=[];shared;clumpMap;layers;band;local=new L;star=new L;constructor(e,n,r,i,a){this.scene=e,this.data=n;let s=n.kind===`protoplanetary`,c=new S(r[0]?vt(r[0]):`#ffffff`),l=new S(n.color).multiply(c);this.clumpMap=new o(Ka(n.seed,...Ya),...Ya,st),this.clumpMap.wrapS=Nt,this.clumpMap.magFilter=this.clumpMap.minFilter=t,this.clumpMap.needsUpdate=!0;let u=n.inner*.98;this.shared={uClumpMap:{value:this.clumpMap},uInner:{value:u},uLogSpan:{value:Math.log(n.outer/u)},uTaper:{value:n.taper},uOuter:{value:n.outer},uAspect:{value:n.aspect},uFlare:{value:n.flare},uWobble:{value:s?0:.1},uSpiral:{value:new D(n.spiral,n.pitch)},uClumps:{value:s?J.clumps:J.clumps*.3},uTime:{value:0},uOmega:{value:2*Math.PI/a},uDepth:{value:n.depth},uTauPower:{value:J.tauPower},uSlantCap:{value:s?J.slantCap:J.debrisSlantCap},uContrast:{value:s?J.contrast:0},uOpaque:{value:+!!s},uGrazeFade:{value:+!s},uInside:{value:0},uBrightness:{value:1},uHabitable:{value:i},uLightPower:{value:J.lightPower},uMaxLight:{value:J.maxLight},uForward:{value:s?J.forward:J.debrisForward},uColor:{value:l},uStar:{value:this.star},uFade:{value:new D(J.near,J.far)}},this.geometry=ao(n,u),this.layers=s?Ja:qa;let d=this.layers.map(e=>Math.exp(-(e*e)/2)),f=d.reduce((e,t)=>e+t,0);this.layers.forEach((e,t)=>{let n=new A({vertexShader:Qa,fragmentShader:$a,uniforms:{...this.shared,uLayer:{value:0},uLayerWeight:{value:0},uShade:{value:1}},blending:5,blendSrc:201,blendDst:205,depthWrite:!1,transparent:!0,side:2}),r=new P(this.geometry,n);r.name=`${s?`Protoplanetary`:`Debris`} disc sheet ${t}`,r.renderOrder=-.01+t*.001,r.frustumCulled=!1,r.onBeforeRender=(e,n,i)=>this.prepareSheet(r,t,i,d,f),this.sheets.push(r),this.object.add(r)}),this.band=s?null:this.createBand(l),this.object.name=s?`Protoplanetary disc`:`Debris disc`,e.add(this.object)}animate(e){this.shared.uTime.value=e;let t=this.data.kind===`protoplanetary`;this.shared.uBrightness.value=t?J.discBrightness:J.debrisBrightness,this.shared.uLightPower.value=J.lightPower,this.shared.uForward.value=t?J.forward:J.debrisForward,this.shared.uMaxLight.value=J.maxLight,this.shared.uTauPower.value=J.tauPower,this.shared.uSlantCap.value=t?J.slantCap:J.debrisSlantCap,this.band&&(this.band.material.uniforms.uBandDepth.value=J.debrisBandDepth),this.shared.uContrast.value=t?J.contrast:0,this.shared.uClumps.value=t?J.clumps:J.clumps*.3,this.shared.uFade.value.set(J.near,J.far)}update(){}createBand(e){let{data:t}=this,n=t.outer*.9,r=t.aspect*t.outer*(n/t.outer)**t.flare,i=new rn(n,n,2*eo*r,to[0],to[1],!0),a=new P(i,new A({vertexShader:no,fragmentShader:ro,uniforms:{uHeight:{value:r},uHabitable:this.shared.uHabitable,uLightPower:this.shared.uLightPower,uMaxLight:this.shared.uMaxLight,uLightAt:{value:this.shared.uHabitable.value},uStar:this.shared.uStar,uBandDepth:{value:J.debrisBandDepth},uInside:this.shared.uInside,uBrightness:this.shared.uBrightness,uForward:this.shared.uForward,uColor:{value:e},uFade:this.shared.uFade},blending:5,blendSrc:201,blendDst:201,depthWrite:!1,transparent:!0,side:1}));return a.renderOrder=-.02,a.onBeforeRender=(e,t,n)=>this.measureInside(n),a.frustumCulled=!1,a.name=`Debris disc band`,this.object.add(a),a}measureInside(e){this.object.worldToLocal(e.getWorldPosition(this.local));let{data:t}=this,n=Math.hypot(this.local.x,this.local.z),r=Math.min(Math.max(n,t.inner),t.outer),i=t.aspect*t.outer*(r/t.outer)**t.flare,a=1-k.smoothstep(Math.abs(this.local.y)/i,.3,1),o=1-k.smoothstep(n/t.outer,.5,.85);this.shared.uInside.value=a*o}prepareSheet(e,t,n,r,i){this.object.worldToLocal(n.getWorldPosition(this.local)),this.object.getWorldPosition(this.star);let a=this.local.y>=0?t:this.layers.length-1-t,o=this.layers[a],s=e.material.uniforms;s.uLayer.value=o,s.uLayerWeight.value=r[a]/i;let c=Math.abs(o)/this.layers[this.layers.length-1];s.uShade.value=this.data.kind===`protoplanetary`?J.midplane+(1-J.midplane)*c:1}dispose(){this.scene.remove(this.object),this.geometry.dispose(),this.clumpMap.dispose();for(let e of this.sheets)e.material.dispose();this.band?.geometry.dispose(),this.band?.material.dispose()}};function ao(e,t){let n=9797,r=new Float32Array(n*3),i=new Float32Array(n),a=new Float32Array(n),o=[];for(let n=0;n<=Za;n++){let s=t*(e.outer/t)**(n/Za),c=en(e,s),l=Jt(e,s);for(let e=0;e<97;e++){let t=2*Math.PI*e/Xa,u=n*97+e;r.set([s*Math.cos(t),0,s*Math.sin(t)],u*3),i[u]=c,a[u]=l,e<Xa&&n<Za&&o.push(u,u+97,u+1,u+1,u+97,u+97+1)}}let s=new w;return s.setAttribute(`position`,new C(r,3)),s.setAttribute(`aBase`,new C(i,1)),s.setAttribute(`aRel`,new C(a,1)),s.setIndex(o),s}function oo(e){let t=e.folder(`Dust discs`);t?.add(J,`discBrightness`,0,4),t?.add(J,`debrisBrightness`,0,1),t?.add(J,`lightPower`,.2,1),t?.add(J,`forward`,0,.9),t?.add(J,`debrisForward`,0,.9),t?.add(J,`debrisSlantCap`,.02,1),t?.add(J,`maxLight`,.5,6),t?.add(J,`debrisBandDepth`,0,3),t?.add(J,`midplane`,0,1),t?.add(J,`clumps`,0,1),t?.add(J,`tauPower`,.1,1),t?.add(J,`slantCap`,.02,1),t?.add(J,`contrast`,0,2),t?.add(J,`near`,0,300),t?.add(J,`far`,0,1500)}var so=10,co=6,lo=class{scene;data;stars;planets;moons=[];comets;nuclei;belts;dust;trails;asteroids=[];small;bodies;anchor;galacticLight;galacticCentre;airLight={value:I.air};ambient;glowTexture;_time=0;scratch=new L;constructor(e,t,n,r,i={x:1,y:0,z:0}){this.scene=e,this.data=n,this.glowTexture=Be();let a=n.stars.length>1;this.stars=n.stars.map((r,i)=>new ke(e,t,a?`${n.name} ${`AB`[i]}`:n.name,r,R(n.seed,`star`,i)));let o=this.stars[0],s=new L(i.x,i.y,i.z).normalize(),l=o?{vector:o.object.position,point:!0}:{vector:s,point:!1,strength:this.airLight};this.galacticCentre=o?null:s,this.galacticLight=o?null:new Ie(I.color,I.intensity),this.galacticLight&&(this.galacticLight.name=`Galactic light`,this.galacticLight.position.copy(s).multiplyScalar(1e3),e.add(this.galacticLight)),this.planets=n.planets.map(r=>{let i=new T(e,t,{...r,life:et(n,r)},uo(r,n.dust?.kind===`protoplanetary`),r.extent+so,l);for(let a of r.moons){let o={...a,life:et(n,r,a)},s=new T(e,t,o,`${pe(a.type)} · moon`,a.radius+co,l,i);this.moons.push(s)}return i}),this.comets=n.comets.map(r=>{let i=new T(e,t,Dt(r),Ne(r),r.radius+co,l);return new Ft(e,r,i,n.habitableRadius,this.glowTexture)}),this.nuclei=this.comets.map(e=>e.nucleus),this.belts=n.belts.map(n=>{let r=n.asteroids.map(r=>new T(e,t,Kt(r),It(r,n),r.radius+co,l));return this.asteroids.push(...r),new wt(e,n,r)}),this.small=[...this.nuclei,...this.asteroids];let u=n.stars.reduce((e,t)=>e+t.mass,0);this.dust=n.dust?new io(e,n.dust,n.stars,n.habitableRadius,ie(n.dust.inner,u)):null,this.trails=n.comets.map(t=>new Wa(e,t,n.habitableRadius)),this.bodies=[...this.stars,...this.planets,...this.moons,...this.small],this.anchor=this.stars[0]??this.planets[0],this.ambient=new te(`#9bb8ff`,`#1a1020`,.35),e.add(this.ambient),this.animate(this._time),r&&(this.galacticLight&&c(r),_t(r),Ce(r),Ve(r),ne(r),oo(r),Ga(r));let d=r?.folder(`Stars`);d?.add(v,`pace`,0,5),d?.add(v,`granulation`,.2,3),d?.add(v,`spots`,0,3),d?.add(v,`limbDarkening`,0,1),d?.add(v,`corona`,0,3),d?.add(v,`intensity`,.5,5),d?.add(v,`rim`,0,3),d?.add(v,`rimWidth`,.02,1),d?.add(v,`glare`,0,2),d?.add(f,`particleSize`,.005,.1),d?.add(f,`brightness`,0,3);let p=r?.folder(`Comets`);p?.add(j,`activeDistance`,.3,3),p?.add(j,`tailLength`,0,300),p?.add(j,`maxTailLength`,0,1e3),p?.add(j,`tailWidth`,0,20),p?.add(j.nearFade,`0`,0,20).name(`nearFade from`),p?.add(j.nearFade,`1`,0,100).name(`nearFade to`),p?.add(j,`dustCurve`,0,1);let m=r?.folder(`Asteroid belts`);m?.add(O,`meshPixels`,1,12),m?.add(O,`minPixels`,0,3),m?.add(O,`dotBrightness`,0,4),m?.add(O,`dustNear`,0,1e3),m?.add(O,`dustFar`,0,3e3),m?.add(O,`dustBrightness`,0,1),m?.add(O,`reselect`,0,2),m?.add(O,`maxMeshes`,0,5e3,50)}get time(){return this._time}fixedUpdate(e){this._time+=e;for(let t of this.stars)t.step(this._time,e);for(let t of this.planets)t.step(this._time,e);for(let t of this.moons)t.step(this._time,e);for(let t of this.small)t.step(this._time,e)}setTime(e){this._time=e;for(let t of this.stars)t.jumpTo(e,m);for(let t of this.planets)t.jumpTo(e,m);for(let t of this.moons)t.jumpTo(e,m);for(let t of this.small)t.jumpTo(e,m)}pose(e,t,n){for(let t of this.stars)t.positionAt(e,t.object.position);for(let r of this.planets)this.posePlanet(r,e,t,n);for(let r of this.moons)this.posePlanet(r,e,t,n);for(let r of this.small)this.posePlanet(r,e,t,n);this.animate(e)}unpose(){for(let e of this.planets)e.object.scale.setScalar(1);for(let e of this.moons)e.object.scale.setScalar(1);for(let e of this.small)e.object.scale.setScalar(1)}update(e,t){this.galacticLight&&(this.galacticLight.color.set(I.color),this.galacticLight.intensity=I.intensity,this.airLight.value=I.air);for(let n of this.stars)n.update(e,t);for(let n of this.planets)n.update(e,t);for(let n of this.moons)n.update(e,t);for(let n of this.small)n.update(e,t);let n=this._time-m*(1-t);for(let e of this.planets)e.spinAt&&(e.spinAngle=e.spinAt(n));for(let e of this.moons)e.spinAt&&(e.spinAngle=e.spinAt(n));for(let e of this.small)e.spinAt&&(e.spinAngle=e.spinAt(n));this.animate(n)}animate(e){for(let t of this.stars)t.animate(e);for(let t of this.planets)t.animate(e);for(let t of this.moons)t.animate(e);for(let t of this.small)t.animate(e);for(let t of this.comets)t.poseAt(e);for(let t of this.belts)t.animate(e);this.dust?.animate(e);for(let t of this.trails)t.animate(e)}dispose(){for(let e of this.stars)e.dispose();for(let e of this.planets)e.dispose();for(let e of this.moons)e.dispose();for(let e of this.comets)e.dispose();for(let e of this.small)e.dispose();for(let e of this.belts)e.dispose();this.dust?.dispose();for(let e of this.trails)e.dispose();this.scene.remove(this.ambient),this.ambient.dispose(),this.galacticLight&&(this.scene.remove(this.galacticLight),this.galacticLight.dispose()),this.glowTexture.dispose()}posePlanet(e,t,n,r){let i=e.positionAt(t,e.object.position);e.object.scale.setScalar(kt(e.radius,this.scratch.subVectors(i,n).length(),r))}};function uo(e,t){let n=[he(e.type,e.size)];return t&&n.push(`forming`),e.rings&&n.push(`rings`),e.moons.length>0&&n.push(e.moons.length===1?`1 moon`:`${e.moons.length} moons`),n.join(` · `)}var fo=3,po=1.5,mo=24*Math.PI/180,ho=.7,go=class extends ft{ref;touchControls=`space`;data;world;ship;orbit;band;nebulaSky;hud;map;skyStars;marker;starSounds;trails;aimBody=null;aimWeight=0;constructor(e,t,n,r,i,o,s,c,l,u){let d=Zt.create(m);super(d),this.ref=e,this.data=b(e);let f=_a.near(s,e.position),p=ba(f,e.position,this.data);this.band=this.add(new oa(this.scene,e,this.data,i,p)),this.nebulaSky=f.length>0?this.add(new _a(this.scene,e,this.data,f,i)):null,this.skyStars=this.add(new Ia(this.scene,o,e,this.data,i,p));let h=this.data.stars.length>0?void 0:a(e.position,this.data.galacticTilt).bulge;this.world=this.add(new lo(this.scene,d,this.data,i,h));let g=this.world.anchor;this.ship=this.add(new ye(this.scene,d,n,this.world.bodies,i,c,g)),this.ship.parkAt(g,90),this.orbit=this.add(new tn(t,this.ship.object,n,{...Qe,maxDistance:qt(de(this.data),Qe.maxDistance)},{distance:90,pitch:this.hoverElevation(90,0),onZoomPastLimit:e=>e>0?l():u(),zoomLimitsHold:()=>this.ship.enRoute,keepOut:e=>this.keepOutOfBodies(e)},i,`System camera`)),this.starless||this.aimAt(g,1),this.starSounds=this.add(new _i(t,this.world.stars,c,i));let _=this.add(new yi(t,n,this.ship,this.world.bodies,c,[],this.world.belts));this.trails=this.add(new Ta(this.scene,t,this.world.planets.filter(e=>e.config.orbit.radius>0),this.world.moons,e=>e===_.hovered||e===this.ship.targetBody,i)),this.marker=this.add(new bi(this.scene,t,this.ship)),this.map=this.add(new Xi(this.data,this.world.stars,this.world.planets,this.world.moons,this.ship,_,n,this.world.belts)),this.hud=this.add(new wi(this.ship,_,this.map,n,this.data,r))}get starless(){return this.world.stars.length===0}aimAt(e,t=0){this.aimBody=e,this.aimWeight=t,this.orbit.setAim(e.renderPosition,t,mo)}get aim(){return{body:this.aimBody,weight:this.aimWeight}}clearAim(){this.aimBody=null,this.aimWeight=0,this.orbit.setAim(null)}aimFade(e){this.orbit.setAim(this.aimBody?.renderPosition??null,this.aimWeight*e,mo)}hoverElevation(e,t){if(this.world.stars.some(e=>e===this.ship.targetBody))return B.starElevation;let[n,r]=B.cameraElevation,i=hn(e,this.ship.parkDistance(this.ship.targetBody),B.bodyBelowCentre);return k.clamp(Math.max(i,t),n,r)}approachableBody(){let e=this.ship.targetBody;return!this.ship.enRoute&&e instanceof T?e:null}bodyInReach(){let e=this.ship.targetBody;return e instanceof T&&this.touching(e)?e:null}renderSky(e,t,n,r,i){this.world.pose(n,t.position,i);let a=this.ship.object.visible;this.ship.object.visible=!1,this.marker.hide();let o=this.trails.visible;this.trails.visible=!1;for(let e of r)e.object.visible=!1;for(let e of this.world.comets)e.object.visible=!r.includes(e.nucleus)&&!e.nucleus.busted;Je(e,this.scene,t,Yt.enabled,!1);for(let e of r)e.object.visible=!0;for(let e of this.world.comets)e.object.visible=!e.nucleus.busted;this.trails.visible=o,this.ship.object.visible=a,this.world.unpose()}update(e,t){if(super.update(e,t),this.zoomLocked)return;this.ship.viewDistance=this.orbit.zoom;let n=this.aimBody&&this.ship.targetBody===this.aimBody?1:0;this.aimWeight+=(n-this.aimWeight)*(1-Math.exp(-e/ho)),n===0&&this.aimWeight<.001&&(this.aimBody=null),this.orbit.setAim(this.aimBody?.renderPosition??null,this.aimWeight,mo)}keepOutOfBodies(e){for(let t of this.world.bodies){let n=t.renderPosition,r=t.radius+po,i=e.distanceTo(n);i>=r||(i<1e-6?e.y+=r:e.sub(n).multiplyScalar(r/i).add(n))}}render(e,t){e.toneMappingExposure=this.starless?I.exposure:1,Je(e,this.scene,t),e.toneMappingExposure=1}touching(e){return this.ship.object.position.distanceTo(e.renderPosition)<e.radius+fo}enter(){this.hud.activate(),this.map.activate(),this.starSounds.mute(!1)}exit(){this.hud.deactivate(),this.map.deactivate(),this.ship.silence(),this.starSounds.mute(!0)}},_o=new L,vo=new L(0,0,1),yo=new L(0,1,0),bo=600,xo=class{game;debug;sfx;galaxyLevel;_systemLevel;_planetLevel=null;side=new L;tooltip=new fn;surfaceChanges=new ae;busted=new xe;inventory=new ge;seamless=null;view=new F;rotation=new F;direction=new L;settle=new L;planetSpin=e=>this._planetLevel?.frame.spinAt(e)??0;nebulas;stars;constructor(e,t,n,r,i){this.game=e,this.debug=r,this.sfx=i;let{camera:a,input:o,renderer:s}=e;this.nebulas=t.nebulas,this.stars=t.stars,this.galaxyLevel=new ui(t,n,a,o,s.domElement,this.tooltip,r,i,()=>this.toSystem()),this._systemLevel=this.createSystem(n),e.setLevel(this._systemLevel);let c=r.folder(`Arrival`);c?.add(B,`start`,.2,.8),c?.add(B,`minStart`,1,4),c?.add(B,`flightTime`,1,8),c?.add(B,`bodyBelowCentre`,0,.5),c?.add(pn,`pastHandover`,.5,3),c?.add(pn,`reach`,1,5),c?.add(mn,`maxLatitude`,0,1.5);let l=r.folder(`Zoom moves the ship`);l?.add(z,`referenceView`,12,200),l?.add(z,`hoverRadii`,.1,4),l?.add(z,`gapExponent`,0,1.5),l?.add(z,`gapOutExponent`,0,1.5),l?.add(z,`maxHoverGap`,4.5,60),l?.add(z,`minGap`,3.5,20),l?.add(z,`lowAltitude`,1,20),l?.add(z,`highRadii`,.5,4),l?.add(z,`altitudeCurve`,.5,3)}get systemLevel(){return this._systemLevel}get planetLevel(){return this._planetLevel}get mode(){let e=this.game.level;return e===this.galaxyLevel?`galaxy`:e===this._planetLevel?`planet`:`system`}get itemUser(){return this.mode===`planet`&&!this.transitioning?this._planetLevel:null}get transitioning(){return this.seamless!==null}get crossfade(){return this.game.crossfadeWeight}toGalaxy(){if(this.transitioning||this.mode!==`system`)return;let e=this._systemLevel,t=this.galaxyLevel,n=e.orbit,r=t.orbit,i=Qr(e.data.starZone,Math.max(n.zoom,this.game.camera.position.length())),a=$r(i);t.showCloseUp(e.data,a,()=>e.world.time);let o=()=>n.orientation(this.view).premultiply(t.systemRotation(e.data,this.rotation));this.beginSeamless({zoom:this.seamlessZoom(n.zoom,i,60/a),outgoing:e,incoming:t,apply:i=>{i.blend<1&&(n.setFocus(_o,i.lead),n.setDistance(i.distance),e.aimFade(1-i.lead),e.ship.setScale(1-i.lead)),i.blend>0&&(r.setDistance(i.distance*a),r.setView(o(),1-i.tail),t.setDive(1-i.tail))},swap:()=>{this.game.setLevel(t);let e=this.direction.copy(vo).applyQuaternion(o());r.lookFrom(gn(e,-ci,ci,e))},finish:()=>{t.hideCloseUp(),t.setDive(0),r.setView(null),r.zoomTo(60),n.setFocus(null),e.ship.setScale(1)}})}toSystem(){let e=this.galaxyLevel,t=e.ship;if(this.transitioning||this.mode!==`galaxy`||t.travelling)return;this._systemLevel.ref!==t.current&&(this._systemLevel.dispose(),this._systemLevel=this.createSystem(t.current));let n=this._systemLevel,r=e.orbit,i=n.orbit,a=Zr(n.data.starZone),o=$r(a);e.showCloseUp(n.data,o,()=>n.world.time);let s=()=>r.orientation(this.view).premultiply(e.systemRotation(n.data,this.rotation).invert());this.beginSeamless({zoom:this.seamlessZoom(r.zoom/o,a,90),outgoing:e,incoming:n,apply:t=>{t.blend<1&&(r.setDistance(t.distance*o),e.setDive(t.lead)),t.blend>0&&(i.setFocus(_o,1-t.tail),i.setDistance(t.distance),i.setView(s(),1-t.tail),n.ship.setScale(t.tail))},swap:()=>{this.game.setLevel(n);let e=this.direction.copy(vo).applyQuaternion(s());this.settle.copy(e),this.flyIn(n,gn(e,...B.shipElevation,e),a);let t=n.hoverElevation(90,0);i.lookFrom(gn(this.settle,t,t,this.settle)),n.starless||n.aimAt(n.world.anchor,0)},finish:()=>{e.hideCloseUp(),e.setDive(0),i.setFocus(null),i.setView(null),i.zoomTo(90),n.ship.setScale(1)}})}toPlanet(e=this._systemLevel.approachableBody()){if(this.transitioning||this.mode!==`system`||!e)return;let t=this._systemLevel,n=t.orbit,r=this.game.camera,i=ei(e.radius,r.position.distanceTo(e.renderPosition)),a=mn.maxLatitude,o=gn(this.side.copy(vo).applyQuaternion(n.orientation(this.view)),-a,a,this.side),s=this.createPlanet(e,o),c=s.orbit,{frame:l}=s,u=l.scale,d=()=>n.orientation(this.view).premultiply(l.inverse);t.ship.silence(),So(e)&&this.sfx.play(`reentry`),this.beginSeamless({zoom:this.planetZoom(n.zoom,i,ni(s.ship.object.position.length(),45)/u),outgoing:t,incoming:s,apply:r=>{r.blend<1&&(n.setFocus(e.renderPosition,r.lead),n.setDistance(r.distance),t.aimFade(1-r.lead),t.ship.setScale(1-r.lead)),r.blend>0&&(c.setFocus(_o,1-r.tail),c.setDistance(ri(r.distance*u,r.tail,s.ship.object.position.length())),c.setView(d(),1-r.tail),s.ship.setScale(r.tail)),e.spinAt=r.blend>0&&r.blend<1?this.planetSpin:null},swap:()=>{s.restart(t.world.time,o),this.game.setLevel(s),c.lookFrom(this.direction.set(0,-1,0).applyQuaternion(d()),!0)},finish:()=>{e.spinAt=null,n.setFocus(null),t.ship.setScale(1),c.setFocus(null),c.setView(null),c.zoomTo(45),s.ship.setScale(1)}})}leavePlanet(){let e=this._planetLevel;if(this.transitioning||!e||this.mode!==`planet`||e.busy)return;let t=this._systemLevel,{body:n,frame:r}=e,i=e.orbit,a=t.orbit,o=r.scale,s=ti(n.radius,Math.max(i.zoom,this.game.camera.position.length())/o),c=this.leaveDistance(n,s),l=()=>i.orientation(this.view).premultiply(r.quaternion);this.sfx.play(`leavePlanet`),this.beginSeamless({zoom:this.planetZoom(ni(e.ship.object.position.length(),i.zoom)/o,s,c),outgoing:e,incoming:t,apply:r=>{r.blend<1&&(i.setFocus(_o,r.lead),i.setDistance(ri(r.distance*o,1-r.lead,e.ship.object.position.length())),e.ship.setScale(1-r.lead)),r.blend>0&&(a.setFocus(n.renderPosition,1-r.tail),a.setDistance(r.distance),a.setView(l(),1-r.tail),t.ship.setScale(r.tail)),n.spinAt=r.blend>0&&r.blend<1?this.planetSpin:null},swap:()=>{t.world.setTime(e.time),n.spinAngle=r.spinAngle,t.ship.parkAt(n,c),this.game.setLevel(t);let i=this.direction.copy(vo).applyQuaternion(l()),o=t.hoverElevation(c,Math.atan2(i.y,Math.hypot(i.x,i.z)));a.lookFrom(gn(i,o,o,i))},finish:()=>{n.spinAt=null,this.dropPlanet(),a.setFocus(null),a.setView(null),a.zoomTo(c),t.ship.setScale(1)}})}update(e){if(!this.transitioning&&this.mode===`system`){let e=this._systemLevel.bodyInReach();e&&this.toPlanet(e)}this.seamless&&this.stepSeamless(e)}dispose(){this.dropPlanet(),this._systemLevel.dispose(),this.galaxyLevel.dispose()}seamlessZoom(e,t,n){let{lead:r,overlap:i,tail:a}=qr;return{lead:r,overlap:i,tail:a,start:e,handover:t,end:n}}planetZoom(e,t,n){let{lead:r,overlap:i,tail:a}=Jr;return{lead:r,overlap:i,tail:a,start:e,handover:t,end:n}}beginSeamless(e){this.seamless={...e,elapsed:0,swapped:!1,started:!1},this.game.input.blocked=!0,e.outgoing.zoomLocked=e.incoming.zoomLocked=!0,e.apply(ii(e.zoom,0)),this.game.renderer.compile(e.incoming.scene,this.game.camera)}stepSeamless(e){let t=this.seamless;t.started&&(t.elapsed+=e),t.started=!0;let n=ii(t.zoom,t.elapsed);!t.swapped&&n.blend>0&&(t.swapped=!0,t.swap()),t.apply(n),this.game.setCrossfade(n.blend>0&&n.blend<1?t.outgoing:null,n.blend),n.done&&(t.finish(),t.outgoing.zoomLocked=t.incoming.zoomLocked=!1,this.seamless=null,this.game.input.blocked=!1)}flyIn(e,t,n){let r=e.world.anchor,i=r.radius+Ke(ut(r.radius),90),a=Math.min(.8*n,Math.max(B.start*n,B.minStart*i)),o=this.side.copy(t).multiplyScalar(a),s=o.distanceTo(this.direction.copy(yo).multiplyScalar(i).add(r.position));e.ship.flyIn(r,o,2*s/B.flightTime,90)}leaveDistance(e,t){let n=e.standoff;for(let t of this._systemLevel.world.moons)t.parent===e&&(n=Math.max(n,t.position.distanceTo(e.position)+t.radius));let{pastHandover:r,maxDistance:i}=pn;return Math.min(i,Math.max(90,r*t,pn.reach*n))}createPlanet(e,t){let{camera:n,input:r}=this.game;return this._planetLevel=new Ot(this._systemLevel,e,t,n,r,this.debug,()=>this.leavePlanet(),this.surfaceChanges.forPlanet(x(e.config)),this.tooltip,this.sfx,e.blastedAt,t=>{this.busted.bust(x(e.config),t),e.bust(t)},this.inventory),this._planetLevel}dropPlanet(){this._planetLevel?.dispose(),this._planetLevel=null}createSystem(e){let{camera:t,input:n}=this.game,r=new go(e,t,n,this.tooltip,this.debug,this.stars,this.nebulas,this.sfx,()=>this.toGalaxy(),()=>this.toPlanet());for(let e of[...r.world.planets,...r.world.moons,...r.world.nuclei,...r.world.asteroids]){let t=x(e.config);if(this.busted.isBusted(t))e.bust(r.world.time-bo);else for(let n of this.surfaceChanges.find(t)?.volcanoes??[])e.addVolcano(n,null)}let i=new URL(location.href);return i.searchParams.set(`star`,String(e.id)),history.replaceState(null,``,i),r}};function So(e){return!!e.config.atmosphere||an(e.config)}var Co=new URL(`ambient_music-DXnDEoWQ.mp3`,import.meta.url).href,wo=new URL(`ambient_sound-HgCvJ8En.mp3`,import.meta.url).href,To={master:.8,music:.8,ambience:.5,sfx:.7,muted:!1},Eo=e=>Math.min(1,Math.max(0,e));function Do(e){let t={...To};if(!e)return t;let n;try{n=JSON.parse(e)}catch{return t}if(typeof n!=`object`||!n)return t;let r=n;for(let e of[`master`,`music`,`ambience`,`sfx`]){let n=r[e];typeof n==`number`&&Number.isFinite(n)&&(t[e]=Eo(n))}return typeof r.muted==`boolean`&&(t.muted=r.muted),t}function Oo(e){let t=Eo(e);return t*t}function ko(e,t){return e.muted?0:Oo(e.master)*Oo(e[t])}var Ao=new URL(`ufo_abduct_ray_lp1-DSZQYtV1.wav`,import.meta.url).href,jo=new URL(`ufo_abduct_collect_start-BNPstEBu.wav`,import.meta.url).href,Mo=new URL(`sfx_ufo_abduct_success5-DdGN5-XD.wav`,import.meta.url).href,No=new URL(`ufo_megabomb_launch1-DUfhSH6T.wav`,import.meta.url).href,Po=new URL(`ufo_megabomb_launch2-B_XtF_ih.wav`,import.meta.url).href,Fo=new URL(`ufo_megabomb_launch3-DGRxIprx.wav`,import.meta.url).href,Io=new URL(`ufo_megabomb_launch5-BbIHa7Fg.wav`,import.meta.url).href,Lo=new URL(`ufo_volcano_explosion1-zdrrRwmL.wav`,import.meta.url).href,Ro=new URL(`ufo_drop_cargo_impact_far1-B34_eAEg.wav`,import.meta.url).href,zo=new URL(`ufo_drop_cargo_impact_far2-Cy888CqD.wav`,import.meta.url).href,Bo=new URL(`ufo_drop_cargo_impact_far3-D3Nns3Cd.wav`,import.meta.url).href,Vo=new URL(`ufo_export_beam_lp-BUU7tiH2.wav`,import.meta.url).href,Ho=new URL(`interstell_drive_b-DBMpoBEJ.wav`,import.meta.url).href,Uo=new URL(`interstell_drive_c-CIavvGeT.wav`,import.meta.url).href,Wo=new URL(`interstellar_drive_d-CN4DGlDs.wav`,import.meta.url).href,Go=new URL(`sfx_ufo_exit_atmo1-B34cBPzR.wav`,import.meta.url).href,Ko=new URL(`kave_msri-big-explosion-sfx-369789-CVnQuKmK.mp3`,import.meta.url).href,qo=new URL(`sfx_ufo_reentry_atmo1-BSN2OOBR.wav`,import.meta.url).href,Jo=new URL(`sfx_ufo_reentry_atmo2-Na_bTfql.wav`,import.meta.url).href,Yo=new URL(`sfx_ufo_reentry_atmo3-GVtXXzA0.wav`,import.meta.url).href,Xo=new URL(`ui_spg_goto_planet1-COFyIZgn.wav`,import.meta.url).href,Zo=new URL(`freesound_community-ambient-spacecraft-hum-33119-BGTgf_iQ.mp3`,import.meta.url).href,Qo=new URL(`space_bluestar_far-CNI4MSdL.wav`,import.meta.url).href,$o=new URL(`space_bluestar_close-CAqsK_gD.wav`,import.meta.url).href,es=new URL(`interstell_drive_a-Bq9vdN_M.wav`,import.meta.url).href,ts=[`select`,`systemTravel`,`interstellarTravel`,`reentry`,`leavePlanet`,`busterFire`,`busterFlight`,`busterImpact`,`planetExplode`,`volcanoFire`,`volcanoRise`,`abductBeam`,`abductStart`,`abductSuccess`,`exportBeam`,`dropImpact`,`starNear`,`starFar`,`shipHum`],ns=[`starNear`,`starFar`,`shipHum`],Y=()=>({volume:1,channel:`sfx`,loop:!1,fadeIn:0,fadeOut:.15,loopCrossfade:0}),rs=()=>({volume:1,channel:`sfx`,loop:!0,fadeIn:.2,fadeOut:1.2,loopCrossfade:.5}),is=e=>({volume:e,channel:`ambience`,loop:!0,fadeIn:.3,fadeOut:1.5,loopCrossfade:.5}),X={select:Y(),systemTravel:rs(),interstellarTravel:rs(),reentry:Y(),leavePlanet:Y(),busterFire:Y(),busterFlight:{...rs(),fadeIn:.1,fadeOut:.3},busterImpact:Y(),planetExplode:Y(),volcanoFire:Y(),volcanoRise:Y(),abductBeam:{...rs(),fadeIn:.1,fadeOut:.3},abductStart:Y(),abductSuccess:Y(),exportBeam:{...rs(),fadeIn:.1,fadeOut:.3},dropImpact:Y(),starNear:is(.8),starFar:is(.8),shipHum:is(.35)},as=[`mp3`,`ogg`,`wav`,`m4a`,`webm`,`flac`];function os(e){let t=Object.fromEntries(ts.map(e=>[e,[]])),n=new Set(as);for(let r of Object.keys(e).sort()){let i=r.split(`/`),a=i.at(-1)??``,o=i.at(-2)??``,s=a.includes(`.`)?a.slice(a.lastIndexOf(`.`)+1).toLowerCase():``;n.has(s)&&ts.includes(o)&&t[o].push(e[r])}return t}var ss=class{rng;last=new Map;constructor(e){this.rng=e}next(e,t){if(t<=0)return-1;let n=this.last.get(e),r=this.rng.int(0,t-1);return t>1&&n!==void 0&&n<t&&(r=this.rng.int(0,t-2),r>=n&&r++),this.last.set(e,r),r}},cs=os(Object.assign({"../assets/audio/sfx/abductBeam/ufo_abduct_ray_lp1.wav":Ao,"../assets/audio/sfx/abductStart/ufo_abduct_collect_start.wav":jo,"../assets/audio/sfx/abductSuccess/sfx_ufo_abduct_success5.wav":Mo,"../assets/audio/sfx/busterFire/ufo_megabomb_launch1.wav":No,"../assets/audio/sfx/busterFire/ufo_megabomb_launch2.wav":Po,"../assets/audio/sfx/busterFire/ufo_megabomb_launch3.wav":Fo,"../assets/audio/sfx/busterFire/ufo_megabomb_launch5.wav":Io,"../assets/audio/sfx/busterImpact/ufo_volcano_explosion1.wav":Lo,"../assets/audio/sfx/dropImpact/ufo_drop_cargo_impact_far1.wav":Ro,"../assets/audio/sfx/dropImpact/ufo_drop_cargo_impact_far2.wav":zo,"../assets/audio/sfx/dropImpact/ufo_drop_cargo_impact_far3.wav":Bo,"../assets/audio/sfx/exportBeam/ufo_export_beam_lp.wav":Vo,"../assets/audio/sfx/interstellarTravel/interstell_drive_b.wav":Ho,"../assets/audio/sfx/interstellarTravel/interstell_drive_c.wav":Uo,"../assets/audio/sfx/interstellarTravel/interstellar_drive_d.wav":Wo,"../assets/audio/sfx/leavePlanet/sfx_ufo_exit_atmo1.wav":Go,"../assets/audio/sfx/planetExplode/kave_msri-big-explosion-sfx-369789.mp3":Ko,"../assets/audio/sfx/reentry/sfx_ufo_reentry_atmo1.wav":qo,"../assets/audio/sfx/reentry/sfx_ufo_reentry_atmo2.wav":Jo,"../assets/audio/sfx/reentry/sfx_ufo_reentry_atmo3.wav":Yo,"../assets/audio/sfx/select/ui_spg_goto_planet1.wav":Xo,"../assets/audio/sfx/shipHum/freesound_community-ambient-spacecraft-hum-33119.mp3":Zo,"../assets/audio/sfx/starFar/space_bluestar_far.wav":Qo,"../assets/audio/sfx/starNear/space_bluestar_close.wav":$o,"../assets/audio/sfx/systemTravel/interstell_drive_a.wav":es}));function ls(e,t){return e.map(e=>{let n=e.length,r=Math.max(0,Math.min(Math.floor(t),Math.floor(n/2))),i=e.slice(0,n-r);for(let t=0;t<r;t++){let a=t/r*(Math.PI/2);i[t]=e[t]*Math.sin(a)+e[n-r+t]*Math.cos(a)}return i})}var us=.3,ds=.01,fs={stop(){}},ps=.002;function ms(e){let t={};for(let n of ts)t[n]=e[n].map(e=>{let t=fetch(e).then(t=>{if(!t.ok)throw Error(`${e}: ${t.status}`);return t.arrayBuffer()});return t.catch(()=>{}),t});return t}var hs=class{ctx;outs;buffers={};ready={};variants=new ss(new Ze(R(`sound cues`)));constructor(e,t,n){this.ctx=e,this.outs=t;for(let e of ts)this.buffers[e]=n[e].length?null:[],this.ready[e]=Promise.all(n[e].map(t=>this.decode(e,t))).then(t=>{let n=t.filter(e=>e!==null);return this.buffers[e]=n,n})}variantCount(e){return this.buffers[e]?.length??0}play(e){let t=this.buffers[e];if(t)return this.playOnce(e,t);let n=this.ctx.currentTime;return this.ready[e].then(t=>{this.ctx.currentTime-n<=us&&this.playOnce(e,t)}),0}start(e){return this.loop(e,X[e].volume)}ambient(e,t,n){let r=this.loop(e,t*X[e].volume);return r.setRate(n),{setLevel:t=>r.setGain(t*X[e].volume),setRate:e=>r.setRate(e),stop:()=>r.stop()}}loop(e,t){let n=new gs(this.ctx,this.outs[X[e].channel],X[e],t),r=t=>{let r=this.variants.next(e,t.length);r>=0&&n.begin(t[r])},i=this.buffers[e];return i?r(i):this.ready[e].then(r),n}playOnce(e,t){let n=this.variants.next(e,t.length);if(n<0)return 0;let r=t[n],i=this.ctx.createBufferSource();i.buffer=r;let a=this.ctx.createGain();return a.gain.value=X[e].volume,i.connect(a).connect(this.outs[X[e].channel]),i.onended=()=>{i.disconnect(),a.disconnect()},i.start(this.ctx.currentTime+ds),r.duration}async decode(e,t){try{let n=await this.ctx.decodeAudioData(await t),r=X[e];if(!r.loop||r.loopCrossfade<=0)return n;let i=ls(Array.from({length:n.numberOfChannels},(e,t)=>n.getChannelData(t)),r.loopCrossfade*n.sampleRate),a=this.ctx.createBuffer(i.length,i[0].length,n.sampleRate);return i.forEach((e,t)=>a.copyToChannel(e,t)),a}catch(t){return console.error(`Sound cue '${e}': a file failed to load`,t),null}}},gs=class{ctx;out;spec;target;source=null;gain=null;stopped=!1;rate=1;constructor(e,t,n,r){this.ctx=e,this.out=t,this.spec=n,this.target=r}begin(e){if(this.stopped||this.source)return;let{ctx:t}=this,n=t.currentTime+ds,r=t.createBufferSource();r.buffer=e,r.loop=!0,r.playbackRate.value=this.rate;let i=t.createGain();i.gain.value=0,i.gain.setTargetAtTime(this.target,n,this.timeConstant),r.connect(i).connect(this.out),r.onended=()=>{r.disconnect(),i.disconnect()},r.start(n),this.source=r,this.gain=i}setGain(e){if(this.stopped||Math.abs(e-this.target)<ps)return;this.target=e;let t=this.gain?.gain;if(!t)return;let n=this.ctx.currentTime;t.cancelScheduledValues(n),t.setTargetAtTime(e,n,this.timeConstant)}setRate(e){Math.abs(e-this.rate)<.001||(this.rate=e,this.source?.playbackRate.setTargetAtTime(e,this.ctx.currentTime,.1))}stop(){if(this.stopped)return;this.stopped=!0;let{source:e,gain:t}=this;if(!e||!t)return;let n=this.ctx.currentTime,r=Math.max(this.spec.fadeOut,ds);t.gain.cancelScheduledValues(n),t.gain.setValueAtTime(t.gain.value,n),t.gain.linearRampToValueAtTime(0,n+r),e.stop(n+r+ds)}get timeConstant(){return Math.max(this.spec.fadeIn,ds)/3}},_s=3,vs=4,ys=.05,bs=class{settings;music=new Audio(Co);ambienceData=fetch(wo).then(e=>e.arrayBuffer());cueData=ms(cs);mixer=null;ambience=null;disposed=!1;_lastPlayed=null;ambients=new Set;constructor(e,t){this.settings=e,this.music.loop=!0,this.music.preload=`auto`,this.ambienceData.catch(e=>console.error(`Ambience failed to load`,e)),window.addEventListener(`pointerdown`,this.onGesture,!0),window.addEventListener(`pointerup`,this.onGesture,!0),window.addEventListener(`keydown`,this.onGesture,!0),document.addEventListener(`visibilitychange`,this.onVisibility);let n=t.folder(`Sound cues`);for(let e of ts){let t=X[e],r=cs[e].length,i=n?.addFolder(`${e} (${r} file${r===1?``:`s`})`).close();if(ns.includes(e)){i?.add(t,`volume`,0,3).onChange(()=>this.ambients.forEach(e=>e.refresh())),i?.add(t,`fadeIn`,0,3),i?.add(t,`fadeOut`,0,5);continue}if(t.loop){let t=null;i?.add({"start / stop":()=>{t&&t.stop(),t=t?null:this.start(e)}},`start / stop`)}else i?.add({play:()=>this.play(e)},`play`);i?.add(t,`volume`,0,3),t.loop&&(i?.add(t,`fadeIn`,0,3),i?.add(t,`fadeOut`,0,5))}this.ambient(`shipHum`).setLevel(1)}get state(){return this.mixer?.ctx.state??`locked`}get lastPlayed(){return this._lastPlayed}play(e){let t=this.running();if(!t)return;let n=cs[e].length>0;this.played(e,n,n?t.cues.play(e):0)}start(e){let t=this.running();if(!t)return fs;let n=cs[e].length>0;return this.played(e,n,n?1/0:0),n?t.cues.start(e):fs}ambient(e){let t=new xs(e,()=>this.ambients.delete(t));return this.ambients.add(t),this.mixer&&t.attach(this.mixer.cues),t}get ambientLevels(){return[...this.ambients].map(e=>({cue:e.cue,level:e.level,heard:cs[e.cue].length>0}))}apply(e){if(this.settings=e,!this.mixer)return;let t=this.mixer.ctx.currentTime;for(let[n,r]of Object.entries(this.mixer.gains))r.gain.setTargetAtTime(ko(e,n),t,ys)}dispose(){this.disposed=!0,this.removeGestureListeners(),document.removeEventListener(`visibilitychange`,this.onVisibility);for(let e of[...this.ambients])e.stop();this.ambience?.stop(),this.music.pause(),this.music.removeAttribute(`src`),this.mixer?.ctx.close()}running(){return this.mixer?.ctx.state===`running`?this.mixer:null}played(e,t,n){this._lastPlayed={name:e,heard:t,seconds:n,count:(this._lastPlayed?.count??0)+1}}onGesture=e=>{if(!e.isTrusted||e instanceof PointerEvent&&e.type===`pointerdown`!=(e.pointerType===`mouse`))return;if(this.mixer){this.mixer.ctx.state===`running`?this.removeGestureListeners():document.hidden||(this.mixer.ctx.resume(),this.playMusic());return}let t=new AudioContext,n=t.createGain();n.connect(t.destination),n.gain.setValueAtTime(0,t.currentTime),n.gain.linearRampToValueAtTime(1,t.currentTime+vs);let r={};for(let e of[`music`,`ambience`,`sfx`]){let i=t.createGain();i.gain.value=ko(this.settings,e),i.connect(n),r[e]=i}let i=new hs(t,r,this.cueData);this.mixer={ctx:t,master:n,gains:r,cues:i};for(let e of this.ambients)e.attach(i);t.createMediaElementSource(this.music).connect(r.music),this.startAmbience(t,r.ambience).catch(e=>console.error(`Ambience failed to start`,e)),document.hidden?t.suspend():this.playMusic(),t.state===`running`&&this.removeGestureListeners()};async startAmbience(e,t){let n=await e.decodeAudioData(await this.ambienceData);if(this.disposed)return;let r=ls(Array.from({length:n.numberOfChannels},(e,t)=>n.getChannelData(t)),_s*n.sampleRate),i=e.createBuffer(r.length,r[0].length,n.sampleRate);r.forEach((e,t)=>i.copyToChannel(e,t));let a=e.createBufferSource();a.buffer=i,a.loop=!0,a.connect(t),a.start(),this.ambience=a}onVisibility=()=>{this.mixer&&(document.hidden?(this.music.pause(),this.mixer.ctx.suspend()):(this.mixer.ctx.resume(),this.playMusic()))};playMusic(){this.music.play().catch(e=>{e instanceof DOMException&&e.name===`AbortError`||console.error(`Music failed to play`,e)})}removeGestureListeners(){window.removeEventListener(`pointerdown`,this.onGesture,!0),window.removeEventListener(`pointerup`,this.onGesture,!0),window.removeEventListener(`keydown`,this.onGesture,!0)}},xs=class{cue;onStop;level=0;rate=1;playing=null;stopped=!1;constructor(e,t){this.cue=e,this.onStop=t}attach(e){!this.stopped&&!this.playing&&(this.playing=e.ambient(this.cue,this.level,this.rate))}setLevel(e){this.level=Math.min(1,Math.max(0,e)),this.playing?.setLevel(this.level)}setRate(e){this.rate=e,this.playing?.setRate(e)}refresh(){this.playing?.setLevel(this.level)}stop(){this.stopped||(this.stopped=!0,this.playing?.stop(),this.onStop())}},Ss=`spore2.audio`,Cs=[`master`,`music`,`ambience`,`sfx`];function ws(){try{return Do(localStorage.getItem(Ss))}catch{return Do(null)}}function Ts(e){try{localStorage.setItem(Ss,JSON.stringify(e))}catch{}}var Es=class{audio;settings;root=document.getElementById(`audio`);menuButton=document.getElementById(`menu-toggle`);muteBtn=document.getElementById(`audio-mute`);sliders=Cs.map(e=>({key:e,input:this.root.querySelector(`input[data-key="${e}"]`),value:this.root.querySelector(`output[data-key="${e}"]`)}));constructor(e,t){this.audio=e,this.settings=t;for(let e of this.sliders)e.input.value=String(t[e.key]),e.input.addEventListener(`input`,this.onSlider);this.muteBtn.addEventListener(`click`,this.onMute),window.addEventListener(`keydown`,this.onKey),this.render()}dispose(){for(let e of this.sliders)e.input.removeEventListener(`input`,this.onSlider);this.muteBtn.removeEventListener(`click`,this.onMute),window.removeEventListener(`keydown`,this.onKey)}update(e){this.settings={...this.settings,...e},this.audio.apply(this.settings),Ts(this.settings),this.render()}render(){let{muted:e}=this.settings;for(let e of this.sliders)e.value.textContent=`${Math.round(this.settings[e.key]*100)}%`;this.root.classList.toggle(`muted`,e),this.menuButton?.classList.toggle(`muted`,e),this.muteBtn.textContent=e?`Unmute (M)`:`Mute (M)`,this.muteBtn.setAttribute(`aria-pressed`,String(e))}onSlider=e=>{let t=e.target,n=t.dataset.key;this.update({[n]:Number(t.value),muted:!1})};onMute=()=>{this.update({muted:!this.settings.muted})};onKey=e=>{e.code===`KeyM`&&!e.repeat&&this.onMute()}},Ds=6e3,Os=class{button=document.getElementById(`fullscreen-toggle`);hint=document.getElementById(`fullscreen-hint`);doc=document;hintTimer=0;constructor(){let e=matchMedia(`(display-mode: fullscreen), (display-mode: standalone)`).matches||navigator.standalone===!0,t=!!(this.doc.fullscreenEnabled||this.doc.webkitFullscreenEnabled),n=matchMedia(`(pointer: coarse)`).matches;this.button.hidden=e||!t&&!n,!this.button.hidden&&(this.button.addEventListener(`click`,t?this.onToggle:this.onHint),document.addEventListener(`fullscreenchange`,this.onChange),document.addEventListener(`webkitfullscreenchange`,this.onChange),this.onChange())}get isFullscreen(){return!!(this.doc.fullscreenElement||this.doc.webkitFullscreenElement)}onToggle=()=>{let e=e=>{e&&e.catch(e=>console.warn(`Full screen refused:`,e))};if(this.isFullscreen)e(this.doc.exitFullscreen?this.doc.exitFullscreen():this.doc.webkitExitFullscreen?.());else{let t=document.documentElement;e(t.requestFullscreen?t.requestFullscreen({navigationUI:`hide`}):t.webkitRequestFullscreen?.())}};onHint=()=>{this.hint.hidden=!this.hint.hidden,clearTimeout(this.hintTimer),this.hint.hidden||(this.hintTimer=window.setTimeout(()=>this.hint.hidden=!0,Ds))};onChange=()=>{let e=this.isFullscreen;this.button.classList.toggle(`on`,e),this.button.setAttribute(`aria-label`,e?`Exit full screen`:`Full screen`),this.button.title=e?`Exit full screen`:`Full screen`}},Z={branch:`main`,build:`189`,commit:`c41c92b`,dev:!1,pagesPath:`preview/`};function ks(e){let t=[e.branch??`unknown branch`];return t.push(e.build===null?e.dev?`dev`:`local build`:`build ${e.build}`),e.commit&&t.push(e.commit),t.join(` · `)}var As=3e3,js=null;function Ms(){return js??=`serviceWorker`in navigator?navigator.serviceWorker.register(`sw.js`).catch(e=>(console.warn(`Service worker not registered, so no offline play:`,e),null)):Promise.resolve(null),js}async function Ns(){await Promise.race([Ms(),new Promise(e=>setTimeout(e,As))])}async function Ps(e){if(!(`serviceWorker`in navigator))return!1;let t=await navigator.serviceWorker.getRegistration(e).catch(()=>void 0);return t?.scope===e&&t.active!==null}function Fs(e,t,n){let r=new Set(t.map(t=>e+t));return n.filter(t=>!t.startsWith(e)||r.has(t)?!1:/^pr\/\d+\/$/.test(t.slice(e.length)))}async function Is(e,t){if(!(`serviceWorker`in navigator)||!navigator.onLine||t.length===0)return;let n=await navigator.serviceWorker.getRegistrations(),r=new Set(Fs(e,t,n.map(e=>e.scope)));if(r.size===0)return;await Promise.all(n.filter(e=>r.has(e.scope)).map(e=>e.unregister()));let i=await caches.keys(),a=e=>e.slice(7).split(` `)[0]??``;await Promise.all(i.filter(e=>e.startsWith(`sporer `)&&r.has(a(e))).map(e=>caches.delete(e)))}var Ls=8e3,Rs=6e4,zs=3e3,Bs=6e4,Vs=e=>new Promise(t=>setTimeout(t,e));function Hs(e,t){return Promise.race([Vs(t),new Promise(t=>{let n=()=>{e.state!==`installing`&&(e.removeEventListener(`statechange`,n),t())};e.addEventListener(`statechange`,n),n()})])}var Us=class{status=document.getElementById(`menu-refresh-status`);button=document.getElementById(`menu-refresh`);menuButton=document.getElementById(`menu-toggle`);reg=null;busy=!1;lastCheck=0;constructor(){this.button.addEventListener(`click`,this.onRefresh),window.addEventListener(`online`,this.show),window.addEventListener(`offline`,this.show),this.show(),Ms().then(e=>{e&&(this.reg=e,this.lastCheck=performance.now(),e.addEventListener(`updatefound`,this.onUpdateFound),e.installing&&this.onUpdateFound(),navigator.serviceWorker.addEventListener(`controllerchange`,this.show),this.show())})}check(){!this.reg||this.busy||!navigator.onLine||performance.now()-this.lastCheck<Bs||(this.lastCheck=performance.now(),this.reg.update().catch(()=>{}))}dispose(){this.button.removeEventListener(`click`,this.onRefresh),window.removeEventListener(`online`,this.show),window.removeEventListener(`offline`,this.show),this.reg?.removeEventListener(`updatefound`,this.onUpdateFound),navigator.serviceWorker?.removeEventListener(`controllerchange`,this.show)}onUpdateFound=()=>{let e=this.reg?.installing;e&&(e.addEventListener(`statechange`,this.show),this.show())};get updateReady(){return!!this.reg?.waiting&&!!navigator.serviceWorker.controller}show=()=>{if(this.busy)return;let e=this.reg,t=this.updateReady,n;n=e?t?`A new version is ready: refresh to play it.`:e.installing||e.waiting?navigator.serviceWorker.controller?`Downloading a new version…`:`Saving the game on this device so it starts without internet…`:e.active?`Saved on this device, so it starts without internet. Refresh reloads it, with the newest version if there is one.`:`Reloads the game.`:`Reloads the game.`,navigator.onLine||(n+=` You are offline.`),this.status.textContent=n,this.button.classList.toggle(`primary`,t),this.menuButton?.classList.toggle(`update`,t)};onRefresh=async()=>{if(this.busy)return;this.busy=!0,this.button.disabled=!0;let e=this.reg;try{if(e&&navigator.serviceWorker.controller){navigator.onLine&&!e.waiting&&(this.status.textContent=`Looking for a new version…`,await Promise.race([e.update().catch(()=>{}),Vs(Ls)]));let t=e.installing??e.waiting;if(t?.state===`installing`&&(this.status.textContent=`Downloading the new version…`,await Hs(t,Rs)),t?.state===`installed`){this.status.textContent=`Starting the new version…`;let e=new Promise(e=>navigator.serviceWorker.addEventListener(`controllerchange`,()=>e(),{once:!0}));t.postMessage(`skipWaiting`),await Promise.race([e,Vs(zs)])}}}finally{location.reload()}}},Ws=`spore2.version`,Gs=3e3;function Ks(e){return e===``?`release`:e.replace(/\/$/,``).replace(`/`,`-`)}function qs(e,t){let n=new URL(`.`,e);return n.pathname.endsWith(`/${t}`)?`${n.origin}${n.pathname.slice(0,n.pathname.length-t.length)}`:null}function Js(e){let t=e?.versions;return Array.isArray(t)?t.filter(e=>{let t=e;return typeof t?.id==`string`&&typeof t.label==`string`&&typeof t.path==`string`&&/^(|[\w./-]+\/)$/.test(t.path)&&!t.path.includes(`..`)}):[]}function Ys(e,t,n){return`${e}${t.path}${n}`}function Xs(){return Z.pagesPath===null?null:qs(location.href,Z.pagesPath)}async function Zs(e){try{let t=await fetch(`${e}versions.json`,{cache:`no-store`,signal:AbortSignal.timeout(Gs)});return t.ok?Js(await t.json()):null}catch{return null}}function Qs(){try{return localStorage.getItem(Ws)}catch{return null}}function $s(e){try{e===`release`?localStorage.removeItem(Ws):localStorage.setItem(Ws,e)}catch{}}function ec(){return matchMedia(`(display-mode: fullscreen), (display-mode: standalone)`).matches||navigator.standalone===!0}async function tc(){let e=Qs();if(e===null||Z.pagesPath!==``||!ec())return!1;let t=Xs(),n=t===null?null:await Zs(t);if(t===null||n===null)return!1;let r=n.find(t=>t.id===e);return!r||r.id===`release`?($s(`release`),!1):!navigator.onLine&&!await Ps(t+r.path)?!1:(await Ns(),location.replace(Ys(t,r,location.search)),!0)}var nc=class{section=document.getElementById(`menu-version-section`);select=document.getElementById(`menu-version`);root=Xs();versions=[];constructor(){this.section.hidden=!0,this.select.addEventListener(`change`,this.onChange)}async refresh(){if(this.root===null||Z.pagesPath===null)return;let e=await Zs(this.root);if(e===null)return;Is(this.root,[...e.map(e=>e.path),Z.pagesPath]).catch(()=>{});let t=Ks(Z.pagesPath);e.some(e=>e.id===t)||e.unshift({id:t,label:Z.branch??t,path:Z.pagesPath,ref:``,commit:``,date:``}),this.versions=e,this.select.replaceChildren(...e.map(e=>{let n=new Option(e.commit?`${e.label} · ${e.commit}`:e.label,e.id);return n.selected=e.id===t,n})),this.section.hidden=e.length<2}dispose(){this.select.removeEventListener(`change`,this.onChange)}onChange=()=>{let e=this.versions.find(e=>e.id===this.select.value);e&&this.root!==null&&($s(e.id),location.href=Ys(this.root,e,location.search))}},rc=class{game;levels;root=document.getElementById(`menu`);toggle=document.getElementById(`menu-toggle`);resume=document.getElementById(`menu-resume`);close=document.getElementById(`menu-close`);lab=document.getElementById(`menu-lab`);refresh=new Us;versions=new nc;constructor(e,t){this.game=e,this.levels=t,document.getElementById(`menu-build`).textContent=ks(Z),this.toggle.addEventListener(`click`,this.onToggle),this.resume.addEventListener(`click`,this.onClose),this.close.addEventListener(`click`,this.onClose),this.root.addEventListener(`click`,this.onBackdrop),window.addEventListener(`keydown`,this.onKey),this.versions.refresh()}get isOpen(){return!this.root.hidden}open(){if(this.isOpen)return;let e=this.labBody();this.lab.href=e?y(e):new URL(`lab.html`,location.href).href,this.lab.textContent=e?`Open ${e.name} in the planet lab`:`Open the planet lab`,this.versions.refresh(),this.refresh.check(),this.root.hidden=!1,this.toggle.setAttribute(`aria-expanded`,`true`),this.game.paused=!0,this.resume.focus({preventScroll:!0})}hide(){this.isOpen&&(this.root.hidden=!0,this.toggle.setAttribute(`aria-expanded`,`false`),this.game.paused=!1,document.activeElement?.blur())}dispose(){this.hide(),this.versions.dispose(),this.refresh.dispose(),this.toggle.removeEventListener(`click`,this.onToggle),this.resume.removeEventListener(`click`,this.onClose),this.close.removeEventListener(`click`,this.onClose),this.root.removeEventListener(`click`,this.onBackdrop),window.removeEventListener(`keydown`,this.onKey)}labBody(){let{levels:e}=this;if(e.mode===`planet`)return e.planetLevel?.body??null;if(e.mode!==`system`)return null;let{ship:t,world:n}=e.systemLevel;return t.targetBody instanceof T?t.targetBody:n.planets[0]??null}onToggle=()=>this.isOpen?this.hide():this.open();onClose=()=>this.hide();onBackdrop=e=>{e.target===this.root&&this.hide()};onKey=e=>{e.code!==`Escape`||e.repeat||(e.preventDefault(),this.onToggle())}},ic=`KeyF`,ac=class{game;button=document.getElementById(`graphics-freeze`);note;level=null;text=``;constructor(e){this.game=e,this.note=document.getElementById(`freeze-note`)??document.body.appendChild(Object.assign(document.createElement(`div`),{id:`freeze-note`})),this.button?.addEventListener(`click`,this.onToggle),window.addEventListener(`keydown`,this.onKey),this.render()}get frozen(){return Qt.enabled}set frozen(e){d(e),this.level=this.game.level,this.render()}update(){if(!Qt.enabled)return;if(this.game.level!==this.level){this.frozen=!1;return}let{tested:e,culled:t}=$t;Oe();let n=`View frozen (${this.game.input.touchMode?`the menu`:`F`} to thaw) · frustum culls ${t} of ${e}`;n!==this.text&&(this.note.textContent=this.text=n)}dispose(){this.frozen=!1,this.button?.removeEventListener(`click`,this.onToggle),window.removeEventListener(`keydown`,this.onKey),this.note.remove()}render(){let e=Qt.enabled;this.note.hidden=!e,e&&(this.note.textContent=this.text=`View frozen`),this.button&&(this.button.textContent=`Freeze view: ${e?`on`:`off`}`,this.button.setAttribute(`aria-pressed`,String(e)))}onToggle=()=>{this.frozen=!Qt.enabled};onKey=e=>{if(e.code!==ic||e.repeat||e.ctrlKey||e.metaKey||e.altKey)return;let t=e.target;t&&(t.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))||this.onToggle()}},oc=6,sc=2.5,cc={planetBuster:`<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="6.5" /><path d="m12 5.5-1.5 4 2.5 2-2 3.5.8 3.5" /><path d="M3 3l2.6 2.6M21 3l-2.6 2.6M3 21l2.6-2.6M21 21l-2.6-2.6M12 1v1.5M12 21.5V23M1 12h1.5M21.5 12H23" /></svg>`,volcanoBomb:`<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 21h20l-7-10.5h-6z" /><path d="M9.5 10.5l1.2 3 1.3-1.6 1.3 1.6 1.2-3" /><path d="M10 7.5c-1-1.2-.4-2.8 1-3 .3-1.6 2.6-1.8 3.2-.4 1.4-.2 2.2 1.4 1.3 2.5" /></svg>`,abduct:`<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6.5c0-1.4 3.6-2.5 8-2.5s8 1.1 8 2.5S16.4 9 12 9 4 7.9 4 6.5z" /><path d="M8.5 4.6C9 3.1 10.4 2 12 2s3 1.1 3.5 2.6" /><path d="M9 9.2 5 21M15 9.2l4 11.8" stroke-dasharray="1.5 2" /><path d="M12 21v-3.5M12 17.5l-2.2-.4 1.2-2.1-1.1-.2L12 12l2.1 2.8-1.1.2 1.2 2.1z" /></svg>`},lc=class{source;input;tooltip;icons;root=document.getElementById(`item-bar`);tabsEl=document.getElementById(`item-tabs`);slotsEl=document.getElementById(`item-slots`);hintEl=document.getElementById(`item-hint`);slots=new Map;tabs=new Map;tab=Ye[0].id;items=[];keyWasDown=new Map;note=``;noteTime=0;shownHint=null;shown=null;inventoryVersion=-1;hovered=null;constructor(e,t,n,r){this.source=e,this.input=t,this.tooltip=n,this.icons=r;for(let e of Ye){let t=document.createElement(`button`);t.type=`button`,t.className=`item-tab`,t.dataset.tab=e.id,t.setAttribute(`role`,`tab`),t.textContent=e.name,t.title=`${e.name} (Tab switches)`,t.addEventListener(`click`,()=>this.showTab(e.id)),this.tabsEl.append(t),this.tabs.set(e.id,t)}window.addEventListener(`keydown`,this.onKeyDown),this.showTab(this.tab)}get currentTab(){return this.tab}update(e){let{mode:t,inventory:n}=this.source,r=t!==`galaxy`;if(r!==this.shown&&(this.shown=r,this.root.hidden=!r,document.documentElement.classList.toggle(`items`,r),r||this.unhover()),!r)return;this.tab===`inventory`&&n.version!==this.inventoryVersion&&this.showTab(this.tab);let i=this.source.itemUser;this.items.forEach((e,t)=>{let n=zt(t);if(!n)return;let r=this.input.isDown(n.code);r&&!this.keyWasDown.get(n.code)&&this.toggle(e),this.keyWasDown.set(n.code,r)});let a=``,o=!1,s=e=>{let t=i?i.status(e):null,n=i?.selected===e;o||=n;let r=this.slots.get(e);r&&(r.classList.toggle(`unavailable`,!(t?.available??!1)),r.classList.toggle(`selected`,n),r.setAttribute(`aria-pressed`,String(n))),t?.hint&&(n||!a)&&(a=t.hint)};for(let e of ht)s(e.id);for(let e of this.items)e.count!==null&&s(e.id);let c=i?.selected;c&&!o&&(a=i.status(c).hint||a),this.noteTime>0&&(this.noteTime-=e,a=this.note),a!==this.shownHint&&(this.shownHint=a,this.hintEl.textContent=a,this.hintEl.hidden=!a),this.showTooltip()}dispose(){window.removeEventListener(`keydown`,this.onKeyDown),this.unhover(),this.root.hidden=!0,this.tabsEl.replaceChildren(),this.slotsEl.replaceChildren()}onKeyDown=e=>{if(e.code!==`Tab`||!this.shown||e.ctrlKey||e.altKey||e.metaKey)return;let t=e.target;if(t instanceof HTMLElement&&t!==document.body&&!(t instanceof HTMLCanvasElement)&&!this.root.contains(t))return;e.preventDefault();let n=Ye.findIndex(e=>e.id===this.tab);this.showTab(Ye[(n+(e.shiftKey?Ye.length-1:1))%Ye.length].id)};toggle(e){let t=this.source.itemUser;if(!t){this.say(this.source.transitioning?``:`${e.name}: go down to a planet or moon to use it`);return}if(t.selected===e.id){t.select(null);return}let n=t.status(e.id);if(!n.available){this.say(n.reason??``);return}t.select(e.id)}showTooltip(){let e=this.hovered;if(!e)return;let{item:t}=e,n=this.source.itemUser,r=n?.status(t.id)??null,i=this.items.indexOf(t),a=zt(i)?.label,o=a?`${a} or click`:`Click`,s;s=n?n.selected===t.id?`${r?.hint||`Selected`} · ${o} to put it away`:r&&!r.available?r.reason??r.hint:`${o} to select`:`Go down to a planet or moon to use it`;let c=t.count===null?t.description:`${t.description} (${t.count} of 10)`;this.tooltip.showClaimed(this.tab,`item:${t.id}:${t.count}:${s}`,t.name,c,e.x,e.y,s,!0)}unhover(){this.hovered&&(this.hovered=null,this.tooltip.release())}say(e){this.note=e,this.noteTime=e?sc:0}itemsOf(e){let t=ht.filter(t=>t.tab===e).map(e=>({id:e.id,name:e.name,description:e.description,icon:cc[e.id],count:null}));if(e!==`inventory`)return t;let{inventory:n}=this.source;this.inventoryVersion=n.version;let r=n.stacks.map(e=>({id:At(e.key),name:e.species.name,description:`${rt[e.species.kind].label} from ${e.origin}: set it down with the beam`,icon:`<img class="item-picture" src="${this.icons.url(e.key,e.species)}" alt="" draggable="false">`,count:e.count}));return t.concat(r)}showTab(e){this.tab=e,this.root.dataset.tab=e;for(let[t,n]of this.tabs)n.classList.toggle(`active`,t===e),n.setAttribute(`aria-selected`,String(t===e));this.slots.clear(),this.unhover(),this.items=this.itemsOf(e);let t=this.items.map((e,t)=>{let n=document.createElement(`button`);n.type=`button`,n.className=`item-slot`,n.dataset.item=e.id;let r=zt(t);n.setAttribute(`aria-label`,r?`${e.name} (${r.label})`:e.name),n.setAttribute(`aria-pressed`,`false`);let i=e.count===null?``:`<span class="item-count">${e.count}</span>`;n.innerHTML=`${e.icon}${r?`<span class="item-key">${r.label}</span>`:``}${i}<span class="item-name">${e.name}</span>`,n.addEventListener(`click`,()=>this.toggle(e));let a=t=>{t.pointerType===`mouse`&&(this.hovered={item:e,x:t.clientX,y:t.clientY},this.showTooltip())};return n.addEventListener(`pointerenter`,a),n.addEventListener(`pointermove`,a),n.addEventListener(`pointerleave`,()=>this.unhover()),this.slots.set(e.id,n),n});for(let e=this.items.length;e<oc;e++){let e=document.createElement(`div`);e.className=`item-slot empty`,e.setAttribute(`aria-hidden`,`true`),t.push(e)}this.slotsEl.replaceChildren(...t)}},Q=160,uc=80,dc=class{renderer;cache=new Map;constructor(e){this.renderer=e}url(e,t){let n=this.cache.get(e);if(n)return n;let r=this.draw(t);return this.cache.set(e,r),r}draw(e){let{renderer:t}=this,n=ot(e,0),r=new gt({vertexColors:!0,flatShading:!0,roughness:.9}),i=new pt,a=new P(n,r);a.rotation.y=.6,i.add(a),i.add(new te(14674687,3813408,1.4));let o=new Ie(16774368,2.6);o.position.set(-2,3,2.5),i.add(o),n.computeBoundingBox();let s=n.boundingBox,c=s.getCenter(new L),u=s.getSize(new L),d=Math.max(u.y,u.x,u.z)*.62,f=new jt(30,1,.01,1e3),p=d/Math.tan(k.degToRad(15));f.position.set(0,c.y+p*.2,p).add(new L(c.x,0,c.z)),f.lookAt(c);let m=new l(Q,Q),h=t.getRenderTarget(),g=t.getClearColor(new S),_=t.getClearAlpha();t.setRenderTarget(m),t.setClearColor(0,0),t.clear(),t.render(i,f);let v=new Uint8Array(102400);t.readRenderTargetPixels(m,0,0,Q,Q,v),t.setRenderTarget(h),t.setClearColor(g,_),m.dispose(),n.dispose(),r.dispose();let y=document.createElement(`canvas`);y.width=y.height=Q;let b=y.getContext(`2d`).createImageData(Q,Q);for(let e=0;e<Q;e++)for(let t=0;t<Q;t++){let n=((159-e)*Q+t)*4,r=(e*Q+t)*4;for(let e=0;e<3;e++)b.data[r+e]=fc[v[n+e]];b.data[r+3]=v[n+3]}y.getContext(`2d`).putImageData(b,0,0);let x=document.createElement(`canvas`);x.width=x.height=uc;let ee=x.getContext(`2d`);return ee.imageSmoothingQuality=`high`,ee.drawImage(y,0,0,uc,uc),x.toDataURL(`image/png`)}},fc=Uint8Array.from({length:256},(e,t)=>{let n=t/255,r=n<=.0031308?12.92*n:1.055*n**(1/2.4)-.055;return Math.round(r*255)}),pc=2e3,mc=class{capacity;items=[];_dropped=0;constructor(e){this.capacity=e}push(e){this.items.push(e),this.items.length>this.capacity&&(this.items.shift(),this._dropped++)}get dropped(){return this._dropped}entries(){return this.items.slice()}};function hc(e){let t=e.map(gc).join(` `);return t.length>2e3?`${t.slice(0,pc)}…`:t}function gc(e){if(typeof e==`string`)return e;if(e instanceof Error)return e.stack&&e.stack.includes(e.message)?e.stack:`${e.name}: ${e.message}`;if(typeof e==`object`&&e)try{return JSON.stringify(e)}catch{return String(e)}return String(e)}function _c(e=100){let t=new mc(e),n=()=>performance.now()/1e3;for(let e of[`error`,`warn`]){let r=console[e].bind(console);console[e]=(...i)=>{t.push({t:n(),level:e,text:hc(i)}),r(...i)}}return window.addEventListener(`error`,e=>{let r=e.filename?` (${e.filename}:${e.lineno}:${e.colno})`:``;t.push({t:n(),level:`exception`,text:hc([e.error??e.message])+r})}),window.addEventListener(`unhandledrejection`,e=>{t.push({t:n(),level:`rejection`,text:hc([e.reason])})}),t}var vc=`sporer-debug-dump`;function yc(e){let t=e=>String(e).padStart(2,`0`);return`sporer-dump-${`${e.getFullYear()}-${t(e.getMonth()+1)}-${t(e.getDate())}`}-${t(e.getHours())}${t(e.getMinutes())}-${t(e.getSeconds())}.json`}function bc(e,t){let n=e=>Math.round(Math.min(1,Math.max(0,e))*1e4)/1e4;return{x:n(e),y:n(t)}}function xc(e,t,n,r,i){let a=-1,o=r;return e.forEach((e,r)=>{let s=Math.hypot(e.x-t,(e.y-n)*i);s<=o&&(a=r,o=s)}),a}function Sc(e){if(e.mode===`galaxy`)return`galaxy map`;if(e.mode===`planet`&&e.planet){let t=e.planet.ship,n=t.clearance===null?``:`, ${t.clearance.toFixed(1)} above ground`;return`low orbit over ${e.planet.body.name} (radius ${t.radius.toFixed(1)}${n})`}let t=e.system.ship,n=t.target?.name??`?`;return`system ${e.system.name}: ${t.enRoute?`flying to ${n}`:`hovering at ${n}`}`}function Cc(e){let t=[];e.note.trim()&&t.push(...e.note.trim().split(`
`).map((e,t)=>t===0?`Note: ${e}`:e)),e.marks.length>0&&t.push(`Marks: ${e.marks.map((e,t)=>`${t+1} (${Math.round(e.x*100)}%, ${Math.round(e.y*100)}%)`).join(` · `)}`);let n=e.state;if(n){let e=n.mode===`planet`&&n.planet?n.planet.time:n.system.time,r=n.transitioning?` · mid-transition${n.crossfade===null?``:` (crossfade ${n.crossfade.toFixed(2)})`}`:``;t.push(`Where: ${Sc(n)} · seed ${n.seed??`default`} · star ${n.star} · t=${e.toFixed(2)} s${r}`);let i=n.graphics;t.push(`Camera: distance ${n.orbit.distance.toFixed(1)} · fov ${n.camera.fov} · weather ${i.weather?`on`:`off`} · plants ${i.plants?`on`:`off`}${i.wireframe?` · wireframe`:``}`);let a=n.cargo;if(a&&(a.inventory.stacks.length>0||a.selected||a.inFlight.length>0||a.surface?.planted?.length||a.surface?.removed.length)){let e=a.inventory.stacks.map(e=>`${e.species.name} ×${e.count}`).join(`, `)||`empty`,n=a.surface?` · here: ${a.surface.removed.length} taken, ${a.surface.planted?.length??0} set down`:``,r=a.inFlight.length>0?` · in the air: ${a.inFlight.map(e=>`${e.species} (${e.fate??e.state})`).join(`, `)}`:``;t.push(`Cargo: ${e}${a.selected?` · armed: ${a.selected}`:``}${n}${r}`)}}else e.stateError&&t.push(`State unavailable: ${e.stateError}`);let r=e.build;t.push(`Build: ${r.branch??`?`} · ${r.build===null?r.dev?`dev`:`local`:`build ${r.build}`} · ${r.commit??`?`} · ${e.createdAt}`);let i=e.device,a=e.renderer;t.push(`Device: ${i.viewport[0]}×${i.viewport[1]} @${i.devicePixelRatio}x${i.touch?` · touch`:``}${a?` · ${a.gpu??`unknown GPU`} · ${a.quality} quality`:``}`);let o=e.performance.frames;o&&t.push(`Frames: ${o.fps} FPS · median ${o.p50Ms} ms · 95% ${o.p95Ms} ms · worst ${o.maxMs} ms${a?` · ${a.render.calls} draws`:``}`);let s=e.log.entries.filter(e=>e.level!==`warn`).length,c=e.log.entries.length-s;return e.log.entries.length>0&&t.push(`Console: ${s} errors, ${c} warnings; last: ${e.log.entries.at(-1).text.split(`
`)[0]}`),t}var wc=.04,Tc=class{root=document.getElementById(`dump`);picture=document.getElementById(`dump-picture`);image=document.getElementById(`dump-image`);marksEl=document.getElementById(`dump-marks`);note=document.getElementById(`dump-note`);share=document.getElementById(`dump-share`);save=document.getElementById(`dump-save`);cancel=document.getElementById(`dump-cancel`);close=document.getElementById(`dump-close`);clear=document.getElementById(`dump-clear`);statusEl=document.getElementById(`dump-status`);marks=[];resolve=null;constructor(){this.picture.addEventListener(`click`,this.onPicture),this.share.addEventListener(`click`,this.onShare),this.save.addEventListener(`click`,this.onSave),this.cancel.addEventListener(`click`,this.onCancel),this.close.addEventListener(`click`,this.onCancel),this.clear.addEventListener(`click`,this.onClear)}get isOpen(){return!this.root.hidden}ask(e,t){return this.marks=[],this.renderMarks(),this.note.value=``,this.image.src=e,this.share.hidden=!t,this.save.classList.toggle(`primary`,!t),this.setBusy(!1),this.status(``),this.root.hidden=!1,window.addEventListener(`keydown`,this.onKey,!0),window.addEventListener(`keyup`,this.stopKey,!0),new Promise(e=>this.resolve=e)}status(e){this.statusEl.textContent=e,this.statusEl.hidden=!e}setBusy(e){for(let t of[this.share,this.save,this.cancel,this.close,this.clear])t.disabled=e}hide(){this.root.hidden=!0,window.removeEventListener(`keydown`,this.onKey,!0),window.removeEventListener(`keyup`,this.stopKey,!0),this.image.removeAttribute(`src`),document.activeElement?.blur()}dispose(){this.hide(),this.picture.removeEventListener(`click`,this.onPicture),this.share.removeEventListener(`click`,this.onShare),this.save.removeEventListener(`click`,this.onSave),this.cancel.removeEventListener(`click`,this.onCancel),this.close.removeEventListener(`click`,this.onCancel),this.clear.removeEventListener(`click`,this.onClear)}next(){return new Promise(e=>this.resolve=e)}finish(e){let t=this.resolve;t&&(this.resolve=null,e===`cancel`?this.hide():this.setBusy(!0),t({action:e,note:this.note.value,marks:this.marks.slice()}))}renderMarks(){this.marksEl.replaceChildren(...this.marks.map((e,t)=>{let n=document.createElement(`div`);return n.className=`dump-mark`,n.style.left=`${e.x*100}%`,n.style.top=`${e.y*100}%`,n.appendChild(document.createElement(`span`)).textContent=String(t+1),n})),this.clear.hidden=this.marks.length===0}onPicture=e=>{let t=this.image.getBoundingClientRect();if(t.width===0||t.height===0)return;let n=(e.clientX-t.left)/t.width,r=(e.clientY-t.top)/t.height;if(n<0||n>1||r<0||r>1)return;let i=xc(this.marks,n,r,wc,t.height/t.width);i>=0?this.marks.splice(i,1):this.marks.push(bc(n,r)),this.renderMarks()};onShare=()=>this.finish(`share`);onSave=()=>this.finish(`save`);onCancel=()=>this.finish(`cancel`);onClear=()=>{this.marks=[],this.renderMarks()};onKey=e=>{e.stopPropagation(),e.code===`Escape`&&(e.preventDefault(),this.onCancel())};stopKey=e=>e.stopPropagation()},Ec=1280,Dc=720,Oc=`#ffe14d`,kc=`#e8f1ff`,Ac=`#0a1222`;function jc(e,t,n){let r=[],i=``;for(let a of t.split(` `)){let t=i?`${i} ${a}`:a;if(e.measureText(t).width<=n){i=t;continue}for(i&&r.push(i),i=a;e.measureText(i).width>n&&i.length>1;){let t=i.length-1;for(;t>1&&e.measureText(i.slice(0,t)).width>n;)t--;r.push(i.slice(0,t)),i=i.slice(t)}}return i&&r.push(i),r}function Mc(e,t,n,r,i){e.lineWidth=Math.max(2,r*.14),e.strokeStyle=`rgba(0, 0, 0, 0.75)`,e.beginPath(),e.arc(t,n,r+e.lineWidth*.8,0,Math.PI*2),e.stroke(),e.strokeStyle=Oc,e.beginPath(),e.arc(t,n,r,0,Math.PI*2),e.stroke();let a=Math.max(12,r*.7);e.font=`bold ${a}px system-ui, sans-serif`;let o=e.measureText(i).width+a*.6,s=t+r*.7,c=n-r*.7-a*1.2;e.fillStyle=Oc,e.fillRect(s,c,o,a*1.3),e.fillStyle=`#000`,e.textBaseline=`middle`,e.fillText(i,s+a*.3,c+a*.68)}function Nc(e,t,n,r,i){let a=Math.min(Ec/t,Math.max(1,Dc/t)),o=Math.round(t*a),s=Math.round(n*a),c=document.createElement(`canvas`),l=c.getContext(`2d`),u=Math.round(Math.min(22,Math.max(13,o/42))),d=`${u}px system-ui, sans-serif`,f=Math.round(u*.8);l.font=d;let p=i.flatMap(e=>jc(l,e,o-f*2)),m=Math.round(u*1.35),h=f*2+p.length*m;c.width=o,c.height=s+h,l.drawImage(e,0,0,o,s);let g=Math.max(14,Math.min(o,s)*.045);return r.forEach((e,t)=>Mc(l,e.x*o,e.y*s,g,String(t+1))),l.fillStyle=Ac,l.fillRect(0,s,o,h),l.fillStyle=Oc,l.fillRect(0,s,o,2),l.font=d,l.textBaseline=`top`,l.fillStyle=kc,p.forEach((e,t)=>l.fillText(e,f,s+f+t*m)),c}var Pc=class{capacity;ring;count=0;next=0;last=-1;constructor(e=600){this.capacity=e,this.ring=new Float64Array(e)}frame(e){this.last>=0&&(this.ring[this.next]=e-this.last,this.next=(this.next+1)%this.capacity,this.count=Math.min(this.count+1,this.capacity)),this.last=e}durations(){let e=[],t=(this.next-this.count+this.capacity)%this.capacity;for(let n=0;n<this.count;n++)e.push(this.ring[(t+n)%this.capacity]);return e}stats(){let e=this.durations();if(e.length===0)return null;let t=e.reduce((e,t)=>e+t,0),n=e.slice().sort((e,t)=>e-t),r=e=>n[Math.min(n.length-1,Math.floor(e*n.length))],i=e=>Math.round(e*10)/10;return{frames:e.length,fps:i(1e3*e.length/t),meanMs:i(t/e.length),p50Ms:i(r(.5)),p95Ms:i(r(.95)),maxMs:i(n[n.length-1])}}},Fc=[`stars`,`planets`,`moons`,`comets`,`asteroids`];function Ic(e,t){switch(t){case`star`:return e.stars;case`planet`:return e.planets;case`moon`:return e.moons;case`comet`:return e.nuclei;case`asteroid`:return e.asteroids}}var Lc={stars:`star`,planets:`planet`,moons:`moon`,comets:`comet`,asteroids:`asteroid`};function Rc(e,t){if(!t)return null;for(let n of Fc){let r=Lc[n],i=Ic(e,r).indexOf(t);if(i>=0)return{kind:r,index:i,name:t.name}}return null}function zc(e,t){let n=Ic(e,t.kind)[t.index];return n?.name===t.name?n:e.bodies.find(e=>e.name===t.name)??null}function Bc(e){return[...e.planets,...e.moons,...e.nuclei,...e.asteroids]}var Vc=e=>[e.x,e.y,e.z],Hc=e=>[e.x,e.y,e.z,e.w];function Uc(e){return e.mode===`planet`&&e.planetLevel?e.planetLevel.orbit:e.mode===`galaxy`?e.galaxyLevel.orbit:e.systemLevel.orbit}function Wc(e){let t=document.getElementById(e);return t&&!t.hidden&&t.offsetParent!==null?(t.textContent??``).trim():null}var Gc=[`hud`,`tooltip`,`system-map`,`planet-map`,`touch-controls`,`touch-stick`,`touch-buttons`,`fullscreen-toggle`,`fullscreen-hint`,`menu-toggle`,`fps`];function Kc(){let e=[];for(let t of Gc){let n=document.getElementById(t);if(!n||n.hidden)continue;let r=n.getBoundingClientRect();r.width!==0&&r.height!==0&&e.push({id:t,rect:[Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)]})}return e}function qc(e,t){let n=new URL(location.href).searchParams,r=t.systemLevel,{world:i,ship:a}=r,o=e.camera,s=Uc(t),c=t.mode===`planet`?t.planetLevel:null,l=t.galaxyLevel,u=r.aim,d={};for(let e of[`hud-location`,`hud-climate`,`hud-speed`,`hud-target`,`hud-help`]){let t=Wc(e);t&&(d[e]=t)}let f=Wc(`tooltip`);return{seed:n.get(`seed`),star:r.data.id,mode:t.mode,transitioning:t.transitioning,crossfade:t.crossfade,camera:{position:Vc(o.position),quaternion:Hc(o.quaternion),fov:o.fov,near:o.near,far:o.far,aspect:o.aspect},orbit:{distance:s.zoom,direction:Vc(s.direction(new L)),lookUp:s.lookUpAngle},system:{id:r.data.id,name:r.data.name,starless:r.starless,time:i.time,ship:{position:Vc(a.object.position),speed:a.speed,enRoute:a.enRoute,target:Rc(i,a.targetBody),viewDistance:a.viewDistance},aim:{body:Rc(i,u.body),weight:u.weight},spins:Bc(i).map(e=>e.spinAngle)},planet:c?{body:Rc(i,c.body)??{kind:`planet`,index:-1,name:c.body.name},lab:y(c.body),time:c.frame.time,spinAngle:c.frame.spinAngle,radius:c.radius,ship:{direction:Vc(c.ship.direction),radius:c.ship.radius,goalRadius:c.ship.goalRadius,clearance:c.ship.clearance,enRoute:c.ship.enRoute}}:null,galaxy:t.mode===`galaxy`?{spin:l.spin.angle,current:l.ship.current.id,destination:l.ship.destination?.id??null}:null,graphics:{weather:ue.enabled,plants:Wt.enabled,wireframe:Yt.enabled},busted:{bodies:Bc(i).flatMap(e=>e.blastedAt===null?[]:[{body:Rc(i,e)??{kind:`planet`,index:-1,name:e.name},time:e.blastedAt}]),total:t.busted.count,firing:!!c?.busy,elapsed:c?.buster.elapsed??null},volcanoes:Bc(i).flatMap(e=>e.volcanoSites.length===0?[]:[{body:Rc(i,e)??{kind:`planet`,index:-1,name:e.name},sites:e.volcanoSites}]),cargo:{inventory:t.inventory.toJSON(),surface:c?t.surfaceChanges.forPlanet(x(c.body.config)).toJSON():null,selected:c?.cargo?.selected??null,inFlight:c?.cargo?.inFlight??[]},ui:{touchMode:e.input.touchMode,hud:d,tooltip:f,systemMap:t.mode===`system`&&r.map.visible,planetMap:!!c?.map.visible,overlays:Kc()}}}var $=e=>new Promise(t=>{let n=0,r=()=>++n>=e?t():requestAnimationFrame(r);requestAnimationFrame(r)});async function Jc(e){for(let t=0;t<6e3&&e.transitioning;t++)await $(1);if(e.transitioning)throw Error(`A level transition never finished`);await $(3)}function Yc(e,t){e.setDistance(t.distance),e.lookFrom(new L(...t.direction)),e.setLookUp(t.lookUp)}function Xc(e,t,n){let{world:r}=e;r.setTime(n);let i=Bc(r);t.spins.forEach((e,t)=>{let n=i[t];n&&(n.spinAngle=e)})}async function Zc(e,t,n){let r=[];e.paused=!1,await Jc(t),t.mode!==`system`&&(t.toSystem(),await Jc(t));let i=t.systemLevel;if(i.data.id!==n.system.id)throw Error(`This page is at system ${i.data.id}; load it with ?star=${n.system.id}${n.seed?`&seed=${n.seed}`:``}`);ue.enabled=n.graphics.weather,Wt.enabled=n.graphics.plants,Yt.enabled=n.graphics.wireframe,n.transitioning&&r.push(`taken mid-transition (crossfade ${n.crossfade??`none`}): restored at the ${n.mode} level, settled`);let{world:a,ship:o}=i;for(let{body:e,time:i}of n.busted?.bodies??[]){let n=zc(a,e);if(!n){r.push(`no body ${e.name} to bust`);continue}n.bust(i),t.busted.bust(x(n.config),i)}for(let{body:e,sites:i}of n.volcanoes??[]){let n=zc(a,e);if(!n){r.push(`no body ${e.name} to raise volcanoes on`);continue}let o=t.surfaceChanges.forPlanet(x(n.config));for(let e of i)o.volcanoes.some(t=>t.seed===e.seed)||(o.addVolcano(e),n.addVolcano(e,null))}n.cargo&&(t.inventory.load(n.cargo.inventory),n.cargo.inFlight.length>0&&r.push(`${n.cargo.inFlight.length} plant(s) were on the beam or meeting their fate: left out`)),n.busted?.firing&&r.push(`a planet buster was going off (${n.busted.elapsed?.toFixed(1)} s after firing): restored as busted`);let s=n.system.ship,c=s.target?zc(a,s.target):null;s.target&&!c&&r.push(`no body ${s.target.name} in this system`),s.enRoute&&r.push(`the ship was flying to ${s.target?.name}: parked there instead`);let l=t=>{e.paused=!0,Xc(i,n.system,t),c&&o.parkAt(c,s.viewDistance)};if(n.mode===`planet`&&n.planet){let e=zc(a,n.planet.body);if(!e)throw Error(`No body ${n.planet.body.name} to descend to`);Xc(i,n.system,n.system.time),n.cargo?.surface&&t.surfaceChanges.set(x(e.config),fe.fromJSON(n.cargo.surface)),o.parkAt(e,s.viewDistance),await $(2),t.toPlanet(e),await Jc(t);let c=t.planetLevel;if(!c)throw Error(`Couldn't descend to ${e.name}`);l(n.planet.time),e.spinAngle=n.planet.spinAngle,c.frame.restart(n.planet.time),c.orbit.setDistance(n.orbit.distance),await $(1),c.ship.placeAt(new L(...n.planet.ship.direction)),n.planet.ship.enRoute&&r.push(`the ship was on the autopilot over the planet: stopped where it was`),Yc(c.orbit,n.orbit)}else if(n.mode===`galaxy`&&n.galaxy){l(n.system.time),e.paused=!1,t.toGalaxy(),await Jc(t),e.paused=!0;let i=t.galaxyLevel;i.root.rotation.y=n.galaxy.spin,i.root.updateMatrixWorld(),n.galaxy.destination!==null&&r.push(`the ship was travelling to star ${n.galaxy.destination}: left docked`),Yc(i.orbit,n.orbit)}else{l(n.system.time);let e=n.system.aim.body?zc(a,n.system.aim.body):null;e?i.aimAt(e,n.system.aim.weight):i.clearAim(),Yc(i.orbit,n.orbit)}await $(4);let u=t.mode===`planet`?t.planetLevel:null;if(u){let e=bt.morphSeconds;bt.morphSeconds=0;for(let e=0;e<600&&!u.globeSettled;e++)await $(1);bt.morphSeconds=e,u.globeSettled||r.push(`the globe's detail hadn't finished building`)}e.level?.exit(),e.level?.enter(),await $(2);let d=u?u.map:t.mode===`system`?i.map:null,f=u?n.ui.planetMap:n.ui.systemMap;return d&&d.visible!==f&&(e.input.touchMode?document.getElementById(`touch-map`)?.click():r.push(`the map was ${f?`shown`:`folded`}: press N to match`)),await $(4),r}var Qc=new Set([`app`,`menu`,`dump`,`loading`,`stats`]),$c=`F8`,el=class{game;levels;log;debug;dialog=new Tc;frames=new Pc;button=document.getElementById(`menu-dump`);busy=!1;constructor(e,t,n,r){this.game=e,this.levels=t,this.log=n,this.debug=r,this.button?.addEventListener(`click`,this.onButton),window.addEventListener(`keydown`,this.onKey)}update(){this.frames.frame(performance.now())}async open(){if(this.busy)return;this.busy=!0;let e=this.game.paused;this.game.paused=!0;try{let e=await this.capture(),t=typeof navigator.canShare==`function`&&navigator.canShare({files:[new File([`{}`],`x.json`,{type:`application/json`})]}),n=await this.dialog.ask(e.screenUrl??e.gameUrl??``,t);for(;n.action!==`cancel`;){this.dialog.status(`Making the file…`);let t=JSON.stringify(this.build(e,n)),r=yc(e.createdAt);try{await rl(t,r,n),this.dialog.hide();break}catch(e){e instanceof DOMException&&e.name===`AbortError`?this.dialog.status(``):this.dialog.status(`Couldn't ${n.action}: ${e instanceof Error?e.message:String(e)}`),this.dialog.setBusy(!1),n=await this.dialog.next()}}}finally{this.game.paused=e,this.busy=!1}}data(){let e=this.captureData(),{images:t,...n}=this.build(e,{action:`save`,note:``,marks:[]},!1);return n}restore(e){return Zc(this.game,this.levels,e)}dispose(){this.dialog.dispose(),this.button?.removeEventListener(`click`,this.onButton),window.removeEventListener(`keydown`,this.onKey)}captureData(){let e=null,t;try{e=qc(this.game,this.levels)}catch(e){t=e instanceof Error?e.message:String(e)}return{createdAt:new Date,url:location.href,state:e,stateError:t,game:null,screen:null,gameUrl:null,screenUrl:null,renderer:this.rendererInfo(),device:nl(this.game.input.touchMode)}}async capture(){let e=this.captureData(),t=this.game.renderer.domElement;this.game.redraw();let n=document.createElement(`canvas`);n.width=t.width,n.height=t.height,n.getContext(`2d`).drawImage(t,0,0),e.game=n;try{e.screen=await tl(n,t)}catch(t){e.screenError=t instanceof Error?t.message:String(t)}return e.gameUrl=n.toDataURL(`image/png`),e.screenUrl=e.screen?.toDataURL(`image/jpeg`,.92)??null,e}build(e,t,n=!0){let r=performance.memory,i={format:vc,version:1,createdAt:e.createdAt.toISOString(),url:e.url,note:t.note,marks:t.marks,build:{...Z},device:e.device,renderer:e.renderer,performance:{uptime:Math.round(performance.now())/1e3,frames:this.frames.stats(),frameTimesMs:this.frames.durations().map(e=>Math.round(e*10)/10),jsHeapMb:r?Math.round(r.usedJSHeapSize/1e5)/10:null},state:e.state,...e.stateError?{stateError:e.stateError}:{},log:{entries:this.log.entries(),dropped:this.log.dropped},tunables:this.debug.panel?.save()??null,images:{game:null,screen:null,annotated:null}};if(!n)return i;let a=e.screen??e.game;return i.images={game:e.gameUrl,screen:e.screenUrl,annotated:a?Nc(a,a.width,a.height,t.marks,Cc(i)).toDataURL(`image/jpeg`,.88):null,...e.screenError?{screenError:e.screenError}:{}},i}rendererInfo(){try{let e=this.game.renderer,t=e.getContext(),n=t.getParameter(t.RENDERER),r=t.getParameter(t.VENDOR);if(!n||/webkit/i.test(n)){let e=t.getExtension(`WEBGL_debug_renderer_info`);e&&(n=t.getParameter(e.UNMASKED_RENDERER_WEBGL),r=t.getParameter(e.UNMASKED_VENDOR_WEBGL))}let i=e.getDrawingBufferSize(new D),{info:a,capabilities:o}=e;return{gpu:n,vendor:r,webgl:t.getParameter(t.VERSION),pixelRatio:e.getPixelRatio(),drawingBuffer:[i.x,i.y],maxTextureSize:o.maxTextureSize,precision:o.precision,render:{calls:a.render.calls,triangles:a.render.triangles,points:a.render.points,lines:a.render.lines},memory:{geometries:a.memory.geometries,textures:a.memory.textures},programs:a.programs?.length??0,quality:new URL(location.href).searchParams.get(`quality`)===`low`?`low`:`full`,contextLost:t.isContextLost()}}catch{return null}}onButton=()=>void this.open();onKey=e=>{e.code!==$c||e.repeat||(e.preventDefault(),this.open())}};async function tl(e,t){let{toCanvas:n}=await _(async()=>{let{toCanvas:e}=await import(`./es-BFdEF1jL.js`);return{toCanvas:e}},[],import.meta.url),r=window.innerWidth,i=window.innerHeight,a=Math.max(t.width/Math.max(1,t.clientWidth),Math.min(window.devicePixelRatio,2)),o=await n(document.body,{width:r,height:i,pixelRatio:a,style:{background:`transparent`},skipFonts:!0,filter:e=>!(e instanceof HTMLElement)||!Qc.has(e.id)&&!e.classList.contains(`lil-gui`)}),s=document.createElement(`canvas`);s.width=Math.round(r*a),s.height=Math.round(i*a);let c=s.getContext(`2d`);return c.drawImage(e,0,0,s.width,s.height),c.drawImage(o,0,0,s.width,s.height),s}function nl(e){let t=navigator,n=window.visualViewport,r=e=>typeof matchMedia==`function`&&matchMedia(e).matches;return{userAgent:t.userAgent,platform:t.platform,language:t.language,devicePixelRatio:window.devicePixelRatio,viewport:[window.innerWidth,window.innerHeight],visualViewport:n?[Math.round(n.width),Math.round(n.height),n.scale]:null,screen:[screen.width,screen.height],orientation:screen.orientation?.type??null,touch:e,coarsePointer:r(`(pointer: coarse)`),standalone:r(`(display-mode: standalone)`)||t.standalone===!0,fullscreen:!!document.fullscreenElement,hardwareConcurrency:t.hardwareConcurrency??null,deviceMemory:t.deviceMemory??null}}async function rl(e,t,n){let r=new Blob([e],{type:`application/json`});if(n.action===`share`){let e=new File([r],t,{type:`application/json`});await navigator.share({files:[e],title:t,...n.note.trim()?{text:n.note.trim()}:{}});return}let i=document.createElement(`a`);i.href=URL.createObjectURL(r),i.download=t,document.body.appendChild(i),i.click(),i.remove(),setTimeout(()=>URL.revokeObjectURL(i.href),6e4)}var il=_c(),al=`1337`;async function ol(){if(Ms(),await tc())return;let e=new URLSearchParams(location.search),t=g(De(e.get(`seed`)??al)),n=e.get(`star`),r=n?.toLowerCase()===`sol`&&p(t)||n!==null&&_e(t,Number(n))||be(t),i=Xt(),[a]=await Promise.all([je.create(),Zt.init(),r.real?i:null]),o=new ve(document.getElementById(`app`),a),s=ws(),c=new bs(s,a);new Es(c,s),new cn(sn()),new Os;let l=o.add(new xo(o,t,r,a,c));new rc(o,l),o.add(new Ht),o.add(new ac(o)),o.add(new on(o)),o.add(new lc(l,o.input,l.tooltip,new dc(o.renderer))),o.add(new el(o,l,il,a)),document.getElementById(`loading`)?.remove(),o.start()}ol().catch(e=>{console.error(e);let t=document.getElementById(`loading`);t&&(t.textContent=`Failed to start: ${e instanceof Error?e.message:String(e)}`)});