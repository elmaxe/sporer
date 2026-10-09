const VERSION = "205347d1a61a3c1e";
const FILES = ["animals.html","assets/FpsCounter-C41fn6EB.js","assets/FpsCounter-vM1IV27W.css","assets/GraphicsSettings-L8Qg0Wrn.js","assets/GroveCamera-QgCwCv-K.js","assets/LabLevel-DScz4eCf.js","assets/PlanetLevel-fhVIKE9e.js","assets/StarSystem-CcuocYO3.js","assets/Starfield-cGV4D6uX.js","assets/Starfield-rsRzmD4O.css","assets/ambient_music-DXnDEoWQ.mp3","assets/ambient_sound-HgCvJ8En.mp3","assets/animals-7FXogcxN.js","assets/es-BFdEF1jL.js","assets/freesound_community-ambient-spacecraft-hum-33119-BGTgf_iQ.mp3","assets/geyser_hiss-nXOrWzlb.mp3","assets/interstell_drive_a-Bq9vdN_M.wav","assets/interstell_drive_b-DBMpoBEJ.wav","assets/interstell_drive_c-CIavvGeT.wav","assets/interstellar_drive_d-CN4DGlDs.wav","assets/kave_msri-big-explosion-sfx-369789-CVnQuKmK.mp3","assets/lab-BP433jGO.js","assets/labAnimals-Cd5IcRj6.js","assets/labStars-PYXgW_mr.js","assets/lil-gui.esm-S3c4wCD8.js","assets/main-DEOVEYcr.js","assets/page-BpmxOuFq.js","assets/plants-DV1qr-j7.js","assets/sfx_space_radar_beep5-CR8xslAb.wav","assets/sfx_ufo_abduct_success5-DdGN5-XD.wav","assets/sfx_ufo_exit_atmo1-B34cBPzR.wav","assets/sfx_ufo_reentry_atmo1-BSN2OOBR.wav","assets/sfx_ufo_reentry_atmo2-Na_bTfql.wav","assets/sfx_ufo_reentry_atmo3-GVtXXzA0.wav","assets/space_bluestar_close-CAqsK_gD.wav","assets/space_bluestar_far-CNI4MSdL.wav","assets/stars-DXXNESQM.js","assets/stats.min-D6V8B7RP.js","assets/surfaceMaps-vOPcd9jp.js","assets/ufo_abduct_collect_start-BNPstEBu.wav","assets/ufo_abduct_ray_lp1-DSZQYtV1.wav","assets/ufo_drop_cargo_impact_far1-B34_eAEg.wav","assets/ufo_drop_cargo_impact_far2-Cy888CqD.wav","assets/ufo_drop_cargo_impact_far3-D3Nns3Cd.wav","assets/ufo_export_beam_lp-BUU7tiH2.wav","assets/ufo_laser_loop-J5NIVXvg.wav","assets/ufo_laser_targetburnup1-W9JboOyf.wav","assets/ufo_laser_targetburnup2-jdif6sDD.wav","assets/ufo_laser_targetburnup3-qlZiSqeX.wav","assets/ufo_megabomb_launch1-DUfhSH6T.wav","assets/ufo_megabomb_launch2-B_XtF_ih.wav","assets/ufo_megabomb_launch3-DGRxIprx.wav","assets/ufo_megabomb_launch5-BbIHa7Fg.wav","assets/ufo_volcano_explosion1-zdrrRwmL.wav","assets/ufo_volcano_projectile1-DFab4-7Z.wav","assets/ufo_volcano_projectile2-BbrNoBPM.wav","assets/ui_spg_goto_planet1-COFyIZgn.wav","assets/vent_burst-Dd_lyPSo.mp3","assets/vent_rumble-DXws9LtX.mp3","assets/volcano_close_loop-WCto8QjM.wav","assets/volcano_far_loop-Ct9XScKc.wav","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png","icons/maskable-512.png","index.html","lab.html","manifest.webmanifest","maps/earth.bin","maps/mars.bin","maps/moon.bin","maps/pluto.bin","plants.html","stars.html"];
const sw = self;
const SCOPE = sw.registration.scope;
/** Same as CACHE_PREFIX in pwa/serviceWorker.ts: 'sporer <scope> <version>'. */
const PREFIX = "sporer ";
const CACHE = `${PREFIX}${SCOPE} ${VERSION}`;
/** This build's files, by absolute URL. */
const OWN = new Set(FILES.map((file) => new URL(file, SCOPE).href));
/** Vite's hashed output: a file's name changes with its content, so any copy under that name will do. */
const isHashed = (file) => file.startsWith("assets/");
sw.addEventListener("install", (event) => event.waitUntil(saveAll()));
sw.addEventListener("activate", (event) => event.waitUntil(dropOldCaches().then(() => sw.clients.claim())));
sw.addEventListener("message", (event) => {
	if (event.data === "skipWaiting") void sw.skipWaiting();
});
sw.addEventListener("fetch", (event) => {
	const request = event.request;
	if (request.method !== "GET") return;
	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;
	// The game's pages take ?seed=, ?star=…, the labs a #hash; the files themselves never vary by query.
	url.search = "";
	url.hash = "";
	if (request.mode === "navigate" && url.pathname.endsWith("/")) url.pathname += "index.html";
	if (OWN.has(url.href)) event.respondWith(fromCache(request, url.href));
	else if (/\/(versions|releases)\.json$/.test(url.pathname)) event.respondWith(networkFirst(request, url.href));
});
async function saveAll() {
	const cache = await caches.open(CACHE);
	await Promise.all(FILES.map(async (file) => {
		const url = new URL(file, SCOPE).href;
		if (await cache.match(url)) return;
		const copy = isHashed(file) ? await findCopy(file) : undefined;
		// A new response, not the copy itself: that keeps the other build's URL, which a module script would
		// then load its imports relative to (from the other build's folder).
		if (copy) return cache.put(url, new Response(copy.body, {
			status: copy.status,
			statusText: copy.statusText,
			headers: copy.headers
		}));
		// Unhashed files (the pages, icons, maps) skip the HTTP cache, so they match the hashed ones.
		const response = await fetch(url, { cache: isHashed(file) ? "default" : "no-cache" });
		if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
		await cache.put(url, response);
	}));
}
/** The same hashed file from any build's cache on this device. */
async function findCopy(file) {
	for (const name of await caches.keys()) {
		if (!name.startsWith(PREFIX) || name === CACHE) continue;
		const scope = name.slice(PREFIX.length).split(" ")[0];
		const hit = await (await caches.open(name)).match(new URL(file, scope).href);
		if (hit) return hit;
	}
	return undefined;
}
/** Removes this folder's caches of earlier versions. */
async function dropOldCaches() {
	const mine = `${PREFIX}${SCOPE} `;
	const names = await caches.keys();
	await Promise.all(names.filter((n) => n.startsWith(mine) && n !== CACHE).map((n) => caches.delete(n)));
}
async function fromCache(request, url) {
	const hit = await (await caches.open(CACHE)).match(url);
	if (!hit) return fetch(request);
	const range = request.headers.get("range");
	return range ? partial(hit, range) : hit;
}
/**
* The part of a saved file a range request asks for: the music plays through
* an <audio> element, which asks for ranges and (in Safari) won't play a
* whole file given instead.
*/
async function partial(whole, range) {
	const blob = await whole.blob();
	const size = blob.size;
	const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
	let start = NaN;
	let end = size - 1;
	if (m && m[1] !== "") {
		start = Number(m[1]);
		if (m[2] !== "") end = Math.min(Number(m[2]), size - 1);
	} else if (m && m[2] !== "") {
		start = Math.max(0, size - Number(m[2]));
	}
	if (!(start <= end)) return new Response(null, {
		status: 416,
		headers: { "Content-Range": `bytes */${size}` }
	});
	return new Response(blob.slice(start, end + 1), {
		status: 206,
		headers: {
			"Content-Type": whole.headers.get("Content-Type") ?? "",
			"Content-Range": `bytes ${start}-${end}/${size}`,
			"Content-Length": String(end - start + 1),
			"Accept-Ranges": "bytes"
		}
	});
}
async function networkFirst(request, url) {
	const cache = await caches.open(CACHE);
	try {
		const response = await fetch(request);
		if (response.ok) await cache.put(url, response.clone());
		return response;
	} catch (err) {
		const hit = await cache.match(url);
		if (hit) return hit;
		throw err;
	}
}
