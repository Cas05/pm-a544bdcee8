const CACHE = "pitchmark-v3";
const ASSETS = ["./", "./app.js", "./engine.js", "./icon-192.png", "./icon-512.png", "./index.html", "./manifest.json", "./players-data.js", "./robots.txt", "./styles.css", "./flags/al.svg", "./flags/am.svg", "./flags/ao.svg", "./flags/ar.svg", "./flags/at.svg", "./flags/au.svg", "./flags/ba.svg", "./flags/be.svg", "./flags/bf.svg", "./flags/bg.svg", "./flags/bi.svg", "./flags/bj.svg", "./flags/bo.svg", "./flags/br.svg", "./flags/by.svg", "./flags/ca.svg", "./flags/cd.svg", "./flags/cf.svg", "./flags/cg.svg", "./flags/ch.svg", "./flags/ci.svg", "./flags/cl.svg", "./flags/cm.svg", "./flags/cn.svg", "./flags/co.svg", "./flags/cr.svg", "./flags/cv.svg", "./flags/cz.svg", "./flags/de.svg", "./flags/dk.svg", "./flags/do.svg", "./flags/dz.svg", "./flags/ec.svg", "./flags/ee.svg", "./flags/eg.svg", "./flags/es.svg", "./flags/fi.svg", "./flags/fr.svg", "./flags/ga.svg", "./flags/gb-eng.svg", "./flags/gb-nir.svg", "./flags/gb-sct.svg", "./flags/gb-wls.svg", "./flags/gd.svg", "./flags/ge.svg", "./flags/gh.svg", "./flags/gm.svg", "./flags/gn.svg", "./flags/gq.svg", "./flags/gr.svg", "./flags/gt.svg", "./flags/gw.svg", "./flags/gy.svg", "./flags/hn.svg", "./flags/hr.svg", "./flags/ht.svg", "./flags/hu.svg", "./flags/id.svg", "./flags/ie.svg", "./flags/il.svg", "./flags/iq.svg", "./flags/is.svg", "./flags/it.svg", "./flags/jm.svg", "./flags/jo.svg", "./flags/jp.svg", "./flags/ke.svg", "./flags/km.svg", "./flags/kr.svg", "./flags/lc.svg", "./flags/lt.svg", "./flags/lu.svg", "./flags/ly.svg", "./flags/ma.svg", "./flags/md.svg", "./flags/me.svg", "./flags/mk.svg", "./flags/ml.svg", "./flags/mr.svg", "./flags/mx.svg", "./flags/mz.svg", "./flags/ne.svg", "./flags/ng.svg", "./flags/nl.svg", "./flags/no.svg", "./flags/nz.svg", "./flags/pa.svg", "./flags/pe.svg", "./flags/ph.svg", "./flags/pl.svg", "./flags/ps.svg", "./flags/pt.svg", "./flags/py.svg", "./flags/ro.svg", "./flags/rs.svg", "./flags/ru.svg", "./flags/sa.svg", "./flags/se.svg", "./flags/si.svg", "./flags/sk.svg", "./flags/sl.svg", "./flags/sn.svg", "./flags/sr.svg", "./flags/sv.svg", "./flags/sy.svg", "./flags/tg.svg", "./flags/th.svg", "./flags/tn.svg", "./flags/tr.svg", "./flags/tt.svg", "./flags/tz.svg", "./flags/ua.svg", "./flags/us.svg", "./flags/uy.svg", "./flags/uz.svg", "./flags/ve.svg", "./flags/xk.svg", "./flags/za.svg", "./flags/zm.svg", "./flags/zw.svg", "./fonts/BebasNeue-Regular.ttf", "./fonts/Oswald-Variable.ttf", "./screens/skip_375x812_after.png", "./screens/skip_375x812_before.png", "./screens/skip_390x844_after.png", "./screens/skip_390x844_before.png", "./screens/skip_430x932_after.png", "./screens/skip_430x932_before.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).catch(() => caches.match("./index.html")))
  );
});
