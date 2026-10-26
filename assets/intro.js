/* Welcome intro: "One embassy, seven countries".
   ZimIntro(root, options) draws the intro into `root` and returns { play, finish, setPalette }.
   Needs d3 and topojson-client on the page.
   options.base     URL of the folder holding the photo and flags (default "assets/")
   options.palette  "gold" | "zim" | "flags"
   options.glass    true for the semi-transparent full-screen version
   options.still    true for the map alone, drawn at once in its final state: no story, timeline,
                    welcome card or Skip button (the homepage hero)
   options.onSkip   called by the Skip button (default: jump to the last frame)
   options.onDone   called when the animation has finished and the welcome has been read */
(function () {
  var WORLD_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json";
  var worldPromise = null;
  function loadWorld() {
    if (!worldPromise) {
      worldPromise = fetch(WORLD_URL)
        .then(function (r) { return r.json(); })
        .then(function (topo) { return topojson.feature(topo, topo.objects.countries).features; });
    }
    return worldPromise;
  }

  // cross: where the vertical bar of the Nordic cross sits across the flag's width (0.5 for striped flags)
  // at: the point the flag's cross is centred on; chip: where the country's label sits
  var COUNTRIES = {
    "752": { name: "Sweden", word: "Välkommen", flag: "flag-sweden.svg", aspect: 1.6, cross: 0.375, at: [15.5, 60.8], chip: [16.2, 66.6] },
    "578": { name: "Norway", word: "Velkommen", flag: "flag-norway.svg", aspect: 1.375, cross: 0.364, at: [9.5, 60.8], chip: [6.2, 62.6] },
    "208": { name: "Denmark", word: "Velkommen", flag: "flag-denmark.svg", aspect: 37 / 28, cross: 0.378, at: [9.3, 56.1], chip: [6.4, 55.8] },
    "246": { name: "Finland", word: "Tervetuloa", flag: "flag-finland.svg", aspect: 18 / 11, cross: 0.361, at: [25.5, 62.5], chip: [27.4, 66.8] },
    "233": { name: "Estonia", word: "Tere tulemast", flag: "flag-estonia.svg", aspect: 990 / 630, cross: 0.5, at: [25.6, 58.7], chip: [26.4, 58.8] },
    "428": { name: "Latvia", word: "Laipni lūdzam", flag: "flag-latvia.svg", aspect: 2, cross: 0.5, at: [25.2, 56.9], chip: [25.6, 56.9] },
    "440": { name: "Lithuania", word: "Sveiki atvykę", flag: "flag-lithuania.svg", aspect: 5 / 3, cross: 0.5, at: [23.9, 55.3], chip: [23.9, 55.2] }
  };
  var BALTIC = ["233", "428", "440"];
  var ARC = .38; // how far the thread bows on the map alone, as a share of its length
  // On the small map alone the labels move to where each country has room: the north of Sweden and
  // Finland, Norway's west coast; each Baltic label starts at its country's eastern border, at its latitude
  var STILL_CHIPS = { "752": [13.4, 65.2], "246": [29.6, 69.0], "578": [6.4, 61.4], "208": [6.6, 55.6],
    "233": [28.1, 59.15], "428": [28.3, 56.85], "440": [26.6, 54.65] };
  // "zim" paints the countries in the colours of Zimbabwe's flag (white ones get a dark outline)
  var ZIM_COLOURS = { "752": "#f2b705", "578": "#d6283f", "208": "#f3efe7", "246": "#23955c", "233": "#f3efe7", "428": "#f2b705", "440": "#23955c" };
  var STOCKHOLM = [18.07, 59.33], HARARE = [31.05, -17.83];
  // Three moments, each long enough to read: where it began, how far it reaches, and today's welcome.
  // Only facts with a published source: Sweden's embassy in Harare (relations, 1980) and the Embassy's
  // own list of the seven countries it serves. `light` lists the countries each step adds; the thread
  // is drawn with the first; the last step is the Ambassador's welcome.
  var MILESTONES = [
    { year: "1980", tag: "Relations", date: "1980", light: ["752"],
      text: "Zimbabwe and Sweden establish diplomatic relations." },
    { year: "Expansion", tag: "Seven countries", date: "The Nordic and Baltic countries", word: true, light: ["578", "208", "246", "233", "428", "440"],
      text: "From Stockholm, the Embassy serves seven countries: Sweden, Norway, Denmark and Finland, and the Baltic states Estonia, Latvia and Lithuania." },
    { year: "Today", tag: "Welcome", welcome: true, light: [] }
  ];
  function markup(base, still) {
    var map = '<svg class="zi-map" aria-hidden="true"></svg><div class="zi-labels"></div>';
    if (still) return map;
    return (
    '<button class="zi-skip" type="button">Skip intro</button>' + map +
    '<div class="zi-text"><div class="zi-story">' +
      '<span class="zi-eyebrow">Zimbabwe &amp; the Nordic and Baltic countries</span>' +
      '<div class="zi-year"></div><div class="zi-date"></div><p class="zi-line"></p>' +
    "</div></div>" +
    '<div class="zi-card zi-t">' +
      '<div class="zi-photo"><img src="' + base + 'ambassador-wide.jpg" alt=""></div>' +
      '<div class="zi-tx">' +
        '<svg class="zi-hand" viewBox="0 0 520 110" preserveAspectRatio="xMinYMid meet" aria-hidden="true"><text x="4" y="86">Welcome</text></svg>' +
        '<p class="zi-langs">Mauya <span>·</span> Siyalemukela <span>·</span> Välkommen <span>·</span> Velkommen <span>·</span> Tervetuloa <span>·</span> Tere tulemast <span>·</span> Laipni lūdzam <span>·</span> Sveiki atvykę</p>' +
        '<div class="zi-sign"><strong>H.E. Priscilla Misihairabwi-Mushonga</strong><small>Ambassador of the Republic of Zimbabwe</small></div>' +
      "</div>" +
    "</div>" +
    '<div class="zi-timeline" aria-hidden="true"><div class="zi-track"><i class="zi-fillbar"></i></div><ol class="zi-nodes"></ol></div>'
  ); }

  function nodeLeft(i) { return 6 + i * 88 / (MILESTONES.length - 1); }
  // Drop far-off islands (Svalbard, Jan Mayen) so they do not shape the map or the fills
  function mainland(f) {
    if (f.geometry.type !== "MultiPolygon") return f;
    var polys = f.geometry.coordinates.filter(function (p) { return d3.min(p[0], function (c) { return c[1]; }) < 71.5; });
    return { type: "Feature", id: f.id, properties: f.properties, geometry: { type: "MultiPolygon", coordinates: polys } };
  }
  var instances = 0;
  function show(el) { if (el) el.classList.add("zi-in"); }
  function hide(el) { if (el) el.classList.remove("zi-in"); }

  window.ZimIntro = function (root, options) {
    var opts = options || {};
    var palette = opts.palette || "gold";
    var base = opts.base || "assets/";
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var world = null, pending = "finish", timers = [], instant = false;
    var mode = "idle", lastSize = "", resizeTimer = null;

    var still = !!opts.still;
    // The page can hold two (the intro and the hero map): each needs its own ids for fills and masks,
    // or one would use the other's, and lose them when the intro closes
    var uid = "zi" + (++instances);
    root.classList.add("zi");
    if (opts.glass) root.classList.add("zi-glass");
    if (still) root.classList.add("zi-still");
    root.innerHTML = markup(base, still);
    // The map alone has no story, card or timeline: stand-ins keep the steps below simple
    var story = root.querySelector(".zi-story") || document.createElement("div");
    var card = root.querySelector(".zi-card");
    var skip = root.querySelector(".zi-skip");
    if (skip) skip.addEventListener("click", function () { (opts.onSkip || finish)(); });

    // Instant runs (Skip, reduced motion) execute in order right away: hidden pages throttle timers
    function at(ms, fn) { if (instant) fn(); else timers.push(setTimeout(fn, ms)); }
    function clear() { timers.forEach(clearTimeout); timers = []; }

    function setMilestone(i) {
      if (still) return;
      var m = MILESTONES[i];
      // The welcome step has no line of its own: the card takes its place
      if (m.welcome) {
        root.querySelectorAll(".zi-nodes li").forEach(function (li, j) { li.classList.toggle("zi-done", j <= i); });
        root.querySelector(".zi-fillbar").style.width = nodeLeft(i) + "%";
        return;
      }
      root.querySelectorAll(".zi-nodes li").forEach(function (li, j) { li.classList.toggle("zi-done", j <= i); });
      root.querySelector(".zi-fillbar").style.width = nodeLeft(i) + "%";
      function fill() {
        var yearEl = root.querySelector(".zi-year");
        yearEl.innerHTML = m.ph ? '<span class="zi-ph">' + m.year + "</span>" : m.year;
        // A word instead of a year ("Expansion") is set smaller, to fit the column
        yearEl.classList.toggle("zi-year-word", !!m.word);
        root.querySelector(".zi-date").innerHTML = m.ph ? '<span class="zi-ph zi-sm">' + m.date + "</span>" : m.date;
        root.querySelector(".zi-line").textContent = m.text;
        story.classList.remove("zi-out");
      }
      if (instant) return fill();
      story.classList.add("zi-out");
      timers.push(setTimeout(fill, 280));
    }

    function countryFill(id) {
      if (palette === "gold") return "url(#" + uid + "-gold)";
      if (palette === "zim") return ZIM_COLOURS[id];
      return "url(#" + uid + "-pf-" + id + ")";
    }

    function run(asInstant) {
      clear();
      instant = asInstant || reduceMotion;
      root.classList.add("zi-snap");
      root.querySelectorAll(".zi-in").forEach(hide);
      story.classList.remove("zi-out", "zi-gone");
      if (!still) {
        root.querySelector(".zi-nodes").innerHTML = MILESTONES.map(function (m, i) {
          return '<li style="left:' + nodeLeft(i) + '%"' + (m.ph ? ' class="zi-phnode"' : "") + "><b>" + m.year + "</b><span>" + m.tag + "</span></li>";
        }).join("");
        var saved = instant; instant = true; setMilestone(0); instant = saved;
        root.querySelector(".zi-fillbar").style.width = "0";
        root.querySelectorAll(".zi-nodes li").forEach(function (li) { li.classList.remove("zi-done"); });
      }
      void root.offsetWidth;
      root.classList.remove("zi-snap");
      var W = root.clientWidth, H = root.clientHeight, portrait = W / H < 1.2;
      // No map data yet, or no size yet (hidden or collapsed window): wait, the loader or resize observer reruns it
      if (!world || W < 40 || H < 40) { pending = asInstant ? "finish" : "play"; return; }
      lastSize = W + "x" + H;
      mode = instant ? "done" : "playing";
      var svg = d3.select(root).select("svg.zi-map").attr("viewBox", "0 0 " + W + " " + H);
      svg.selectAll("*").remove();
      var labels = root.querySelector(".zi-labels"); labels.innerHTML = "";
      var defs = svg.append("defs");
      var gold = defs.append("linearGradient").attr("id", uid + "-gold").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 1);
      gold.append("stop").attr("offset", 0).attr("stop-color", "#f7c934");
      gold.append("stop").attr("offset", 1).attr("stop-color", "#c98f00");

      function addEl(cls, p, html) {
        var el = document.createElement("span");
        el.className = cls; el.style.left = p[0] + "px"; el.style.top = p[1] + "px";
        if (html) el.innerHTML = html;
        labels.appendChild(el); return el;
      }

      // The map holds still and fills the right of the frame (the top on phones). It reaches east past
      // Finland so the Zimbabwe inset can sit over Russia, clear of the seven countries.
      // The map alone keeps the countries to the left two-thirds and gives the inset its own column.
      var mapBox = still ? [[W * .02, H * .04], [W * .68, H * .96]]
        : portrait ? [[W * .03, H * .02], [W * .97, H * .54]] : [[W * .36, H * .04], [W * .97, H * .8]];
      var east = still ? 32 : 40;
      var proj = d3.geoConicConformal().parallels([58, 68]).rotate([-22, 0])
        .fitExtent(mapBox, { type: "MultiPoint", coordinates: [[4.5, 53.4], [east, 53.4], [east, 71.3], [4.5, 71.3]] });
      var path = d3.geoPath(proj);
      var near = world.filter(function (f) {
        var c = d3.geoCentroid(f);
        return !COUNTRIES[f.id] && (f.id === "643" || (c[1] > 35 && c[0] > -35 && c[0] < 75));
      });
      svg.append("g").selectAll("path").data(near).join("path").attr("class", "zi-land").attr("d", path);

      var gN = svg.append("g"), els = {};
      world.filter(function (f) { return COUNTRIES[f.id]; }).map(mainland).forEach(function (f) {
        var n = COUNTRIES[f.id], d = path(f);
        if (palette === "flags") {
          // Size the flag so it covers the whole country with the cross centred on n.at
          var b = path.bounds(f), p = proj(n.at);
          var left = p[0] - b[0][0], right = b[1][0] - p[0], half = Math.max(p[1] - b[0][1], b[1][1] - p[1]);
          var iw = Math.max(left / n.cross, right / (1 - n.cross), 2 * half * n.aspect), ih = iw / n.aspect;
          defs.append("pattern").attr("id", uid + "-pf-" + f.id).attr("patternUnits", "userSpaceOnUse").attr("width", W).attr("height", H)
            .append("image").attr("href", base + n.flag).attr("preserveAspectRatio", "none")
            .attr("x", p[0] - iw * n.cross).attr("y", p[1] - ih / 2).attr("width", iw).attr("height", ih);
        }
        gN.append("path").attr("class", "zi-nordic").attr("d", d);
        var flagIcon = palette === "flags" ? "" : '<img src="' + base + n.flag + '" alt="">';
        var chipAt = still && STILL_CHIPS[f.id] ? STILL_CHIPS[f.id] : n.chip;
        els[f.id] = {
          fill: gN.append("path").attr("class", "zi-fill").attr("fill", countryFill(f.id)).attr("d", d).node(),
          line: gN.append("path").attr("class", "zi-outline").attr("d", d).node(),
          // The map alone shows the flag and the name only: the welcome words belong to the intro
          chip: addEl("zi-chip zi-t" + (still && BALTIC.indexOf(f.id) >= 0 ? " zi-right" : ""), proj(chipAt), still ? flagIcon + n.name : "<b>" + n.word + "</b>" + flagIcon + n.name)
        };
      });
      if (palette === "zim") ["208", "233"].forEach(function (id) { if (els[id]) d3.select(els[id].line).attr("stroke", "#13201a"); });
      // On phones the three Baltic labels would overlap: one label for the three
      var balticChip = addEl("zi-chip zi-t", proj([25.2, 56.9]), "<b>Baltics</b>Estonia · Latvia · Lithuania");

      // Zimbabwe in an inset, filled with its flag (hoist side, so the bird shows)
      var bw = still ? W * .27 : portrait ? W * .28 : W * .15, bh = still ? H * .5 : portrait ? H * .17 : H * .24;
      var spot = proj(portrait ? [37, 63.5] : [37.5, 61.5]);
      var bx = Math.min(Math.max(spot[0] - bw / 2, W * .02), W * .98 - bw), by = Math.min(Math.max(spot[1] - bh / 2, H * .03), mapBox[1][1] - bh);
      // The map alone: top right, leaving the lower right to the Baltic labels
      if (still) { bx = W * .98 - bw; by = H * .04; }
      var box = [[bx, by], [bx + bw, by + bh]];
      var frame = svg.append("rect").attr("class", "zi-inset").attr("rx", 10)
        .attr("x", box[0][0]).attr("y", box[0][1]).attr("width", bw).attr("height", bh).node();
      var zw = world.filter(function (f) { return f.id === "716"; })[0];
      var labelH = Math.max(30, bh * .3);
      var iproj = d3.geoMercator().fitExtent([[box[0][0] + bw * .12, box[0][1] + labelH], [box[1][0] - bw * .12, box[1][1] - bh * .08]], zw);
      var ipath = d3.geoPath(iproj), zb = ipath.bounds(zw);
      var fw = Math.max((zb[1][1] - zb[0][1]) * 2, zb[1][0] - zb[0][0]), fh = fw / 2;
      defs.append("pattern").attr("id", uid + "-pf-716").attr("patternUnits", "userSpaceOnUse").attr("width", W).attr("height", H)
        .append("image").attr("href", base + "flag-zimbabwe.svg").attr("preserveAspectRatio", "none")
        .attr("x", zb[0][0]).attr("y", (zb[0][1] + zb[1][1]) / 2 - fh / 2).attr("width", fw).attr("height", fh);
      var zwEl = svg.append("path").attr("class", "zi-zw").attr("fill", "url(#" + uid + "-pf-716)").attr("d", ipath(zw)).node();
      var insetLabel = addEl("zi-inset-label zi-t", [box[0][0] + bw * .08, box[0][1] + bh * .06], "<b>Zimbabwe</b>");
      var harare = iproj(HARARE), hDot = addEl("zi-dot zi-gold", harare);

      // The thread: three stitched strands in Zimbabwe's colours, revealed along the path by a mask
      var sto = proj(STOCKHOLM);
      // Bows south over the Gulf of Finland rather than across Finland itself
      var ctrl = [(harare[0] + sto[0]) / 2, Math.max(harare[1], sto[1]) + H * (portrait ? .08 : .14)];
      // The map alone has Harare up top: the thread arcs upwards over Finland, clear of the Baltic labels.
      // The bend is a share of the thread's length, so the arc keeps its shape at every size.
      if (still) {
        var dx = harare[0] - sto[0], dy = harare[1] - sto[1];
        ctrl = [(harare[0] + sto[0]) / 2 + dy * ARC, (harare[1] + sto[1]) / 2 - dx * ARC];
      }
      var td = "M" + harare + " Q" + ctrl + " " + sto;
      var mask = defs.append("mask").attr("id", uid + "-thread").attr("maskUnits", "userSpaceOnUse").attr("x", 0).attr("y", 0).attr("width", W).attr("height", H);
      var reveal = mask.append("path").attr("d", td).attr("fill", "none").attr("stroke", "#fff").attr("stroke-width", 18).node();
      var L = reveal.getTotalLength();
      reveal.style.strokeDasharray = L; reveal.style.strokeDashoffset = L;
      var gT = svg.append("g").attr("mask", "url(#" + uid + "-thread)");
      [["#146b43", -3], ["#f2b705", 0], ["#c8102e", 3]].forEach(function (c) {
        gT.append("path").attr("class", "zi-stitch").attr("stroke", c[0]).attr("transform", "translate(0 " + c[1] + ")").attr("d", td);
      });
      // The map alone marks the Embassy with a pin where the thread lands, without a label
      var stoDot = still ? null : addEl("zi-dot zi-gold", sto);
      var stoChip = still
        ? addEl("zi-pin zi-t", sto, '<svg viewBox="0 0 24 32" aria-hidden="true"><path d="M12 1C6 1 1 5.9 1 12c0 8.3 11 19 11 19s11-10.7 11-19C23 5.9 18 1 12 1z"/><circle cx="12" cy="12" r="4.2"/></svg>')
        : addEl("zi-chip zi-left zi-t", sto, "<b>Embassy</b>Stockholm");

      function enter(id) {
        var e = els[id]; show(e.fill); show(e.line); show(e.chip);
        // On phones the labels would collide: only the latest Nordic country keeps its label,
        // and the Baltic countries share one
        if (portrait && BALTIC.indexOf(id) < 0) ["752", "578", "208", "246"].forEach(function (k) { if (k !== id) hide(els[k].chip); });
        if (portrait && BALTIC.indexOf(id) >= 0) { hide(e.chip); show(balticChip); }
      }

      at(150, function () { show(frame); show(zwEl); show(insetLabel); show(hDot); });
      // A step every 4.2 s: the year and its line, then the countries it adds, one after the other
      var STEP = 4200, FIRST = 600, end = 0;
      MILESTONES.forEach(function (m, i) {
        var t = FIRST + i * STEP;
        if (m.welcome) {
          end = t;
          at(t, function () { setMilestone(i); story.classList.add("zi-gone"); if (card) show(card); });
          return;
        }
        at(t, function () { setMilestone(i); });
        m.light.forEach(function (id, k) { at(t + 600 + k * 280, function () { enter(id); }); });
        if (i === 0) {
          at(t + 900, function () {
            reveal.style.transition = instant ? "none" : "stroke-dashoffset 1.6s ease-in-out";
            reveal.style.strokeDashoffset = 0;
          });
          at(t + 2400, function () { show(stoDot); show(stoChip); });
        }
      });
      // Leave time to read the welcome before handing back
      at(instant ? 0 : end + 4200, function () { mode = "done"; if (opts.onDone) opts.onDone({ skipped: instant }); });
    }

    function play() { run(false); }
    function finish() { run(true); }
    function setPalette(name) { palette = name; finish(); }

    // Everything is laid out from the frame's size: redo it when that changes (rotation, resize, a window
    // that had no size yet). A run in progress starts over; a finished one redraws its last frame.
    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
          var size = root.clientWidth + "x" + root.clientHeight;
          if (!world || size === lastSize || root.clientWidth < 40 || root.clientHeight < 40) return;
          if (mode === "done") run(true);
          else if (mode === "playing") run(false);
          else run(pending === "finish");
        }, 200);
      }).observe(root);
    }

    loadWorld().then(function (w) { world = w; run(pending === "finish"); })
      .catch(function () { story.classList.add("zi-gone"); if (card) show(card); });
    return { play: play, finish: finish, setPalette: setPalette };
  };
})();
