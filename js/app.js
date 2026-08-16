(() => {
  const App = {
    data: null,
    state: null,
    screen: "title",
    session: null,
    lastReveal: null,
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "class") node.className = value;
      else if (key === "style" && typeof value === "object") Object.assign(node.style, value);
      else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
      else if (value !== undefined && value !== null) node.setAttribute(key, value);
    }
    for (const child of [].concat(children)) {
      if (child == null || child === false) continue;
      node.append(child.nodeType ? child : document.createTextNode(child));
    }
    return node;
  };

  function mount(node) {
    const root = $("#app");
    root.replaceChildren(node);
  }

  function youthById(id) {
    return App.data.youths.youths.find((y) => y.id === id);
  }

  function placeById(id) {
    return App.data.config.places.find((p) => p.id === id);
  }

  function attrMeta(id) {
    return App.data.config.attributes[id];
  }

  function blankState() {
    return { v: 2, cards: {}, talked: {}, nightDone: false, introDone: false, seenCardTip: false, lastNode: "lobby" };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(App.data.config.storageKey);
      if (!raw) return blankState();
      const parsed = JSON.parse(raw);
      return parsed && parsed.v === 2 ? parsed : blankState();
    } catch {
      return blankState();
    }
  }

  function saveState() {
    localStorage.setItem(App.data.config.storageKey, JSON.stringify(App.state));
  }

  function cardCount() {
    return Object.keys(App.state.cards).length;
  }

  function nightOpen() {
    return cardCount() >= App.data.config.unlockNightAt;
  }

  function nextEncounterIndex(youthId) {
    return App.state.talked[youthId] || 0;
  }

  function resolveAttribute(scores, lastStyle, habitat) {
    const styles = App.data.config.choiceStyles;
    const totals = {};
    for (const [style, n] of Object.entries(scores || {})) {
      const mapped = styles[style]?.attribute;
      if (!mapped) continue;
      totals[mapped] = (totals[mapped] || 0) + n;
    }
    const keys = Object.keys(totals);
    if (!keys.length) return habitat || "emotion";
    keys.sort((a, b) => totals[b] - totals[a] || 0);
    if (keys.length > 1 && totals[keys[0]] === totals[keys[1]] && lastStyle) {
      return styles[lastStyle]?.attribute || keys[0];
    }
    return keys[0];
  }

  function applyYouthResult(youth, evolve) {
    const attr = resolveAttribute(App.session.scores, App.session.lastStyle, youth.habitat);
    const stage = evolve ? 2 : 1;
    const pack = youth.cards[attr] || youth.cards[youth.habitat];
    const def = pack[Math.min(stage, pack.length) - 1];
    const prev = App.state.cards[youth.id] || null;
    App.state.cards[youth.id] = {
      attribute: attr,
      stage,
      title: def.title,
      line: def.line,
    };
    App.state.talked[youth.id] = (App.state.talked[youth.id] || 0) + 1;
    saveState();
    App.lastReveal = {
      youth,
      attr,
      stage,
      title: def.title,
      line: def.line,
      evolve,
      prev,
    };
  }

  async function loadData() {
    const [config, youths, night, intro, explore] = await Promise.all([
      fetch("data/config.json").then((r) => r.json()),
      fetch("data/youths.json").then((r) => r.json()),
      fetch("data/night.json").then((r) => r.json()),
      fetch("data/intro.json").then((r) => r.json()),
      fetch("data/explore.json").then((r) => r.json()),
    ]);
    App.data = { config, youths, night, intro, explore };
    App.state = loadState();
    if (!App.state.lastNode) App.state.lastNode = explore.start || "lobby";
    if (App.look == null) App.look = 0.45;
  }

  function render() {
    if (App.screen === "title") return mount(viewTitle());
    if (App.screen === "map" || App.screen === "explore") return mount(viewExplore());
    if (App.screen === "dialogue") return mount(viewDialogue());
    if (App.screen === "card") return mount(viewCard());
    if (App.screen === "album") return mount(viewAlbum());
    if (App.screen === "ending") return mount(viewEnding());
  }

  function go(screen) {
    App.screen = screen;
    render();
  }

  function beginPlay() {
    if (!App.state.introDone && cardCount() === 0) startIntro();
    else goExplore();
  }

  function viewTitle() {
    const hasSave = cardCount() > 0 || App.state.nightDone || App.state.introDone;
    return el("section", { class: "screen" }, [
      el("div", {
        class: "title-art",
        style: { backgroundImage: "url(assets/places/lobby.jpg)" },
      }),
      el("div", { class: "kicker" }, App.data.config.chapter),
      el("h1", {}, App.data.config.title),
      el("p", { class: "tagline" }, App.data.config.tagline),
      el("ol", { class: "howto" },
        (App.data.config.howto || []).map((step) =>
          el("li", {}, [
            el("span", { class: "howto-label" }, step.label),
            el("span", {}, step.text),
          ])
        )
      ),
      el("div", { class: "title-actions" }, [
        el("button", {
          class: "btn",
          onclick: beginPlay,
        }, hasSave ? "기록 이어하기" : "첫 사람을 만나러 간다"),
        hasSave && el("button", {
          class: "btn ghost",
          onclick: () => {
            if (confirm("모은 카드와 대화를 모두 지울까요?")) {
              App.state = blankState();
              saveState();
              beginPlay();
            }
          },
        }, "처음부터"),
        el("button", { class: "btn ghost", onclick: () => go("album") }, "앨범"),
      ]),
    ]);
  }

  function placeStatus(place) {
    if (place.night) {
      if (App.state.nightDone) return "오늘은 이만. 밤은 다음에.";
      if (nightOpen()) return "주무관이 로비에 남아 있다.";
      return `카드 ${App.data.config.unlockNightAt}장이 있어야 열린다.`;
    }
    const youth = youthById(place.youthId);
    const talked = nextEncounterIndex(youth.id);
    const card = App.state.cards[youth.id];
    if (talked >= youth.encounters.length) return `${youth.name} · 오늘은 이만`;
    if (talked === 1) return `${youth.name} · 다시 대화할 수 있다`;
    if (card) return `${youth.name} · ${card.title}`;
    return youth.short;
  }

  function isGuided() {
    return App.state.introDone && cardCount() === 0;
  }

  function goExplore() {
    if (!App.state.lastNode || !App.data.explore.nodes[App.state.lastNode]) {
      App.state.lastNode = App.data.explore.start || "lobby";
    }
    go("explore");
  }

  function enterNode(id) {
    const node = App.data.explore.nodes[id];
    if (!node) return;
    App.state.lastNode = id;
    App.look = node.look == null ? 0.45 : node.look;
    App.toast = null;
    saveState();
    goExplore();
  }

  function currentExploreNode() {
    return App.data.explore.nodes[App.state.lastNode] || App.data.explore.nodes.lobby;
  }

  function showToast(text) {
    App.toast = text;
    goExplore();
    clearTimeout(App.toastTimer);
    App.toastTimer = setTimeout(() => {
      if (App.toast === text) {
        App.toast = null;
        if (App.screen === "explore") goExplore();
      }
    }, 2200);
  }

  function useHotspot(hs) {
    if (hs.guideLock && isGuided()) {
      showToast("주무관이 계단을 가리켰다. 먼저 그리로 가자.");
      return;
    }
    if (hs.type === "go") {
      enterNode(hs.go);
      return;
    }
    if (hs.type === "note") {
      showToast(hs.note);
      return;
    }
    if (hs.type === "talk") {
      const youth = youthById(hs.youthId);
      const idx = nextEncounterIndex(youth.id);
      if (idx >= youth.encounters.length) {
        showToast(`${youth.name} · 오늘은 이만.`);
        return;
      }
      startYouth(youth, idx);
    }
  }

  function viewExplore() {
    const node = currentExploreNode();
    const count = cardCount();
    const need = App.data.config.unlockNightAt;
    const guided = isGuided();
    const world = el("div", {
      class: "explore-world",
      style: { backgroundImage: `url(${node.image})` },
    });
    if (node.actor) {
      world.append(el("img", {
        class: "actor",
        src: node.actor.src,
        alt: "",
        style: {
          left: `${node.actor.x}%`,
          bottom: `${node.actor.bottom || 0}%`,
          height: `${node.actor.h}%`,
        },
      }));
    }
    node.hotspots.forEach((hs) => {
      const locked = hs.guideLock && guided;
      const glow = (hs.guide && guided) || (hs.type === "talk" && nextEncounterIndex(hs.youthId) === 0 && !locked);
      const youth = hs.youthId ? youthById(hs.youthId) : null;
      const pin = el("button", {
        class: `pin${glow ? " is-guide" : ""}${locked ? " is-locked" : ""}`,
        style: { left: `${hs.x}%`, top: `${hs.y}%` },
        "data-hot": hs.id,
      }, hs.label);
      pin.addEventListener("pointerup", (ev) => {
        ev.stopPropagation();
        if (App.exploreDragged) return;
        useHotspot(hs);
      });
      world.append(pin);
    });

    const view = el("div", { class: "explore-view" }, [world]);
    const screen = el("section", { class: "screen explore" }, [
      view,
      el("div", { class: "explore-top" }, [
        node.back
          ? el("button", { class: "back-mini", onclick: () => enterNode(node.back) }, "← 뒤로")
          : el("div", { class: "explore-place" }, [
              el("div", { class: "kicker" }, "낮"),
              el("div", { class: "place-name", style: { fontSize: "16px", margin: 0 } }, node.name),
            ]),
        el("button", { class: "chip", onclick: () => go("album") }, `카드 ${count}/${need}`),
      ]),
      el("div", { class: "explore-foot" }, [
        node.back && el("div", { class: "explore-place", style: { marginBottom: "8px" } }, node.name),
        viewNightDoor(),
        el("p", { class: "hint" }, App.toast || node.hint),
      ]),
    ]);

    requestAnimationFrame(() => bindExploreLook(view, world));
    return screen;
  }

  function bindExploreLook(view, world) {
    const apply = () => {
      const max = Math.max(0, world.clientWidth - view.clientWidth);
      const x = Math.max(0, Math.min(1, App.look == null ? 0.45 : App.look));
      world.style.transform = `translateX(${-x * max}px)`;
    };
    apply();
    let sx = 0;
    let start = App.look || 0;
    App.exploreDragged = false;
    view.addEventListener("pointerdown", (ev) => {
      if (ev.target.closest(".pin")) return;
      sx = ev.clientX;
      start = App.look || 0;
      App.exploreDragged = false;
      view.classList.add("is-drag");
      view.setPointerCapture(ev.pointerId);
    });
    view.addEventListener("pointermove", (ev) => {
      if (!view.classList.contains("is-drag")) return;
      const dx = ev.clientX - sx;
      if (Math.abs(dx) > 6) App.exploreDragged = true;
      const max = Math.max(1, world.clientWidth - view.clientWidth);
      App.look = Math.max(0, Math.min(1, start - dx / max));
      apply();
    });
    view.addEventListener("pointerup", () => view.classList.remove("is-drag"));
    view.addEventListener("pointercancel", () => view.classList.remove("is-drag"));
  }

  function viewNightDoor() {
    const need = App.data.config.unlockNightAt;
    const count = cardCount();
    const youths = App.data.youths.youths;
    const open = nightOpen();
    const done = App.state.nightDone;
    const lobby = App.data.config.places.find((p) => p.night);
    return el("button", {
      class: `night-door${open && !done ? " is-open" : ""}${done ? " is-done" : ""}`,
      onclick: () => openPlace(lobby),
    }, [
      el("div", { class: "night-door-copy" }, [
        el("div", { class: "place-floor" }, "폐관 후"),
        el("div", { class: "place-name" }, "밤의 문"),
        el("div", { class: "place-meta" },
          done ? "오늘은 이만. 밤은 다음에."
            : open ? "문이 열렸다. 주무관이 로비에 남아 있다."
              : `카드가 열쇠다. ${count}/${need}`),
      ]),
      el("div", { class: "keys" },
        youths.slice(0, need).map((youth) => {
          const card = App.state.cards[youth.id];
          return el("div", {
            class: `key${card ? " is-in" : ""}`,
            title: youth.name,
            style: card ? { backgroundImage: `url(${youth.portrait})` } : {},
          }, card ? "" : (youths.indexOf(youth) + 1));
        })
      ),
    ]);
  }

  function viewMap() {
    const count = cardCount();
    const need = App.data.config.unlockNightAt;
    const guided = isGuided();
    const guideId = App.data.config.guidePlaceId;
    const dayPlaces = App.data.config.places.filter((p) => !p.night);
    const flash = App.mapHint;
    App.mapHint = null;
    return el("section", { class: "screen" }, [
      el("div", { class: "topbar" }, [
        el("div", {}, [
          el("div", { class: "kicker" }, "낮"),
          el("h2", {}, "고양꿈제작소"),
        ]),
        el("button", { class: "chip", onclick: () => go("album") }, `카드 ${count}/${need}`),
      ]),
      flash && el("p", { class: "hint flash" }, flash),
      guided && el("p", { class: "hint" }, "주무관이 2층 계단을 가리켰다. 먼저 거기 가 보자."),
      ...dayPlaces.map((place) => {
        const waiting = guided && place.id !== guideId;
        const guiding = guided && place.id === guideId;
        return el("button", {
          class: `place${waiting ? " is-wait" : ""}${guiding ? " is-guide" : ""}`,
          style: { backgroundImage: `url(${place.image})` },
          onclick: () => openPlace(place),
        }, [
          el("div", { class: "place-body" }, [
            el("div", { class: "place-floor" }, place.floor),
            el("div", { class: "place-name" }, place.name),
            el("div", { class: "place-meta" },
              waiting ? "아직 아님. 계단부터." : placeStatus(place)),
          ]),
        ]);
      }),
      viewNightDoor(),
      count > 0 && count < need && el("p", { class: "hint" }, "같은 사람에게 다시 가면 카드가 달라진다. 다른 사람도 만나 보자."),
      nightOpen() && !App.state.nightDone && el("p", { class: "hint" }, "세 장이 모였다. 아래 문을 열어 보자."),
      App.state.nightDone && el("p", { class: "hint" }, "말은 말렸다. 열쇠는 이미 손에 있다."),
    ]);
  }

  function openPlace(place) {
    if (place.night) {
      if (!nightOpen()) {
        App.mapHint = "카드 세 장이 모여야 밤의 문이 열린다.";
        goExplore();
        return;
      }
      if (App.state.nightDone) return;
      startStory(App.data.night);
      return;
    }
    if (isGuided() && place.id !== App.data.config.guidePlaceId) {
      App.mapHint = "주무관이 2층 계단을 가리켰다.";
      goExplore();
      return;
    }
    const youth = youthById(place.youthId);
    const idx = nextEncounterIndex(youth.id);
    if (idx >= youth.encounters.length) return;
    startYouth(youth, idx);
  }

  function startYouth(youth, encIndex) {
    const encounter = youth.encounters[encIndex];
    App.session = {
      kind: "youth",
      youthId: youth.id,
      encIndex,
      nodeId: encounter.start,
      scores: {},
      lastStyle: null,
      bg: placeById(youth.placeId)?.image,
      portrait: youth.portrait,
    };
    go("dialogue");
  }

  function startStory(story) {
    const encounter = story.encounters[0];
    App.session = {
      kind: "story",
      storyId: story.id,
      encIndex: 0,
      nodeId: encounter.start,
      scores: {},
      lastStyle: null,
      bg: placeById(story.placeId)?.image,
      portrait: story.portrait,
    };
    go("dialogue");
  }

  function startIntro() {
    const story = App.data.intro;
    const encounter = story.encounters[0];
    App.session = {
      kind: "intro",
      storyId: story.id,
      encIndex: 0,
      nodeId: encounter.start,
      scores: {},
      lastStyle: null,
      bg: placeById(story.placeId)?.image,
      portrait: story.portrait,
    };
    go("dialogue");
  }

  function currentNode() {
    const s = App.session;
    if (s.kind === "youth") {
      const youth = youthById(s.youthId);
      return youth.encounters[s.encIndex].nodes[s.nodeId];
    }
    if (s.kind === "intro") return App.data.intro.encounters[0].nodes[s.nodeId];
    return App.data.night.encounters[0].nodes[s.nodeId];
  }

  function nodeText(node) {
    if (App.session.kind === "youth") {
      const prev = App.state.cards[App.session.youthId];
      if (node.textByPrev && prev && node.textByPrev[prev.attribute]) {
        return node.textByPrev[prev.attribute];
      }
    }
    return node.text || "";
  }

  function advance(nextId) {
    App.session.nodeId = nextId;
    render();
  }

  function finishEncounter() {
    if (App.session.kind === "intro") {
      App.state.introDone = true;
      App.state.lastNode = "lobby";
      saveState();
      App.session = null;
      goExplore();
      return;
    }
    if (App.session.kind === "youth") {
      const youth = youthById(App.session.youthId);
      applyYouthResult(youth, App.session.encIndex > 0);
      go("card");
      return;
    }
    App.state.nightDone = true;
    saveState();
    go("ending");
  }

  function pickChoice(choice) {
    if (choice.style) {
      App.session.scores[choice.style] = (App.session.scores[choice.style] || 0) + 1;
      App.session.lastStyle = choice.style;
    }
    if (choice.next) advance(choice.next);
    else finishEncounter();
  }

  function viewDialogue() {
    const node = currentNode();
    if (!node) return viewExplore();
    if (node.bg) App.session.bg = node.bg;
    const speaker = node.speaker || "";
    const canTap = !node.choices;
    const portrait = speaker && speaker !== "나" ? App.session.portrait : "";
    const forming = App.session.lastStyle
      && App.data.config.choiceStyles[App.session.lastStyle];
    const formingAttr = forming ? forming.attribute : null;
    const isIntro = App.session.kind === "intro";
    const kicker = isIntro ? "시작" : App.session.kind === "story" ? "폐관 이후" : "대화";

    const box = el("section", {
      class: `screen dlg${portrait ? " has-portrait" : ""}`,
      onclick: (ev) => {
        if (!canTap) return;
        if (ev.target.closest(".back-mini")) return;
        if (node.end) finishEncounter();
        else if (node.next) advance(node.next);
      },
    }, [
      el("div", { class: "dlg-bg", style: { backgroundImage: `url(${App.session.bg || ""})` } }),
      el("div", { class: "dlg-inner" }, [
        el("button", {
          class: "back-mini",
          onclick: (ev) => {
            ev.stopPropagation();
            App.session = null;
            go(isIntro ? "title" : "explore");
          },
        }, isIntro ? "← 처음" : "← 장소로"),
        el("div", { class: "portrait-stage" }, [
          portrait && el("img", { src: portrait, alt: speaker }),
        ]),
        el("div", { class: "dlg-panel" }, [
          el("div", { class: "speaker-row" }, [
            speaker && el("div", { class: "speaker-name" }, speaker),
            el("div", { class: "kicker" }, kicker),
          ]),
          node.aside && el("p", { class: "aside" }, node.aside),
          el("p", { class: "line" }, nodeText(node)),
          canTap && el("p", { class: "tap-hint" },
            node.end
              ? (isIntro ? "터치해서 계단으로" : "터치해서 카드를 본다")
              : "터치해서 계속"),
          node.choices && el("div", { class: "choices" },
            node.choices.map((choice) =>
              el("button", {
                class: `choice${choice.style ? ` is-${choice.style}` : ""}`,
                onclick: (ev) => {
                  ev.stopPropagation();
                  pickChoice(choice);
                },
              }, choice.text)
            )
          ),
          formingAttr && el("div", { class: `forming ${formingAttr}` }, [
            el("div", {
              class: "forming-back",
              style: { backgroundImage: "url(assets/ui/card-back.jpg)" },
            }),
            el("p", {}, "이 말이 카드에 스며들고 있다."),
          ]),
        ]),
      ]),
    ]);
    return box;
  }

  function viewCard() {
    const r = App.lastReveal;
    if (!r) return viewExplore();
    const attr = attrMeta(r.attr);
    const card = el("div", { class: "card", id: "flip-card" }, [
      el("div", {
        class: "face face-back",
        style: { backgroundImage: "url(assets/ui/card-back.jpg)" },
      }),
      el("div", {
        class: "face face-front",
        style: { backgroundImage: `url(${r.youth.portrait})` },
      }, [
        el("div", { class: `seal ${r.attr}` }, attr.name),
        el("div", { class: "card-copy" }, [
          el("div", { class: "card-name" }, `${r.youth.name} · ${r.youth.age}`),
          el("div", { class: "card-title" }, r.title),
          el("div", { class: "card-line" }, r.line),
        ]),
      ]),
    ]);

    const count = cardCount();
    const need = App.data.config.unlockNightAt;
    const firstCard = !r.evolve && !r.prev && count === 1;
    if (firstCard && !App.state.seenCardTip) {
      App.state.seenCardTip = true;
      saveState();
    }
    const nextLabel = App.returnTo === "album"
      ? "앨범으로"
      : count >= need && !App.state.nightDone
        ? "밤의 문이 열렸다"
        : "다음 사람을 만나러 간다";

    const screen = el("section", { class: "screen card-screen" }, [
      el("div", { class: "reveal-kicker" }, r.evolve ? "달라졌다" : "흔적이 남았다"),
      el("div", { class: "reveal-title serif" },
        r.evolve ? `${r.youth.name}의 카드가 흔들렸다.` : `${r.youth.name}의 카드.`),
      el("div", { class: "card-scene" }, [card]),
      r.prev && el("p", { class: "prev-note" },
        r.prev.title === r.title
          ? `같은 자리였던 「${r.prev.title}」이 조금 깊어졌다.`
          : `「${r.prev.title}」에서 「${r.title}」로.`
      ),
      firstCard && el("p", { class: "coach" }, "같은 사람에게 다시 가면, 카드가 달라진다."),
      el("p", { class: "door-progress" },
        count >= need ? "열쇠가 다 모였다." : `밤의 문 · 열쇠 ${count}/${need}`),
      el("div", { class: "spacer" }),
      el("button", {
        class: "btn",
        onclick: () => {
          const back = App.returnTo || "explore";
          App.lastReveal = null;
          App.returnTo = null;
          go(back);
        },
      }, nextLabel),
    ]);

    requestAnimationFrame(() => {
      setTimeout(() => $("#flip-card")?.classList.add("is-flip"), 280);
    });
    return screen;
  }

  function viewAlbum() {
    const attrsUsed = new Set(Object.values(App.state.cards).map((c) => c.attribute));
    return el("section", { class: "screen" }, [
      el("div", { class: "topbar" }, [
        el("div", {}, [
          el("div", { class: "kicker" }, "컬렉션"),
          el("h2", {}, "청년 카드"),
        ]),
        el("button", { class: "chip", onclick: () => goExplore() }, "건물로"),
      ]),
      el("div", { class: "album-grid" },
        App.data.youths.youths.map((youth) => {
          const card = App.state.cards[youth.id];
          if (!card) {
            return el("div", { class: "empty-card" }, [
              el("div", { class: "place-floor" }, placeById(youth.placeId).name),
              el("div", { class: "place-name", style: { fontSize: "18px" } }, "아직 만나지 않음"),
              el("div", {}, youth.short),
            ]);
          }
          const attr = attrMeta(card.attribute);
          return el("button", {
            class: "mini-card",
            style: { backgroundImage: `url(${youth.portrait})` },
            onclick: () => previewCard(youth, card),
          }, [
            el("div", { class: "mini-body" }, [
              el("div", { class: `seal ${card.attribute}`, style: { position: "absolute", top: "12px", right: "12px", width: "40px", height: "40px", fontSize: "12px" } }, attr.name),
              el("div", { class: "card-name" }, `${youth.name}${card.stage > 1 ? " · 성장" : ""}`),
              el("div", { class: "place-name", style: { fontSize: "20px" } }, card.title),
              el("div", { class: "place-meta" }, card.line),
            ]),
          ]);
        })
      ),
      el("div", { class: "attrs" },
        Object.values(App.data.config.attributes).map((a) =>
          el("span", { class: `attr-pill${attrsUsed.has(a.id) ? ` on ${a.id}` : ""}` }, a.name)
        )
      ),
      el("p", { class: "progress" }, "감정 · 분석 · 도전은 대화 선택으로 열린다. 경험 · 체력은 다음 장."),
    ]);
  }

  function previewCard(youth, card) {
    App.returnTo = "album";
    App.lastReveal = {
      youth,
      attr: card.attribute,
      stage: card.stage,
      title: card.title,
      line: card.line,
      evolve: false,
      prev: null,
    };
    go("card");
  }

  function viewEnding() {
    return el("section", { class: "screen end-screen" }, [
      el("div", { class: "kicker" }, App.data.config.chapter),
      el("h1", {}, "수집의 끝."),
      el("p", { class: "tagline" }, "주무관은 말렸다. 열쇠는 이미 손에 있다."),
      el("p", { class: "quote" }, "그림은 앞면만 보고 걸면 모른다. 3번 칸 뚜껑은 닫아도 내일 다시 열려 있을 것이다. 밤은, 다음에."),
      el("div", { class: "spacer" }),
      el("div", { class: "stack" }, [
        el("button", { class: "btn", onclick: () => go("album") }, "모은 카드를 본다"),
        el("button", { class: "btn ghost", onclick: () => goExplore() }, "건물로 돌아간다"),
      ]),
    ]);
  }

  async function start() {
    if (location.protocol === "file:") {
      mount(el("section", { class: "screen file-warn" }, [
        el("div", { class: "kicker" }, "로컬 서버가 필요합니다"),
        el("h1", { style: { fontSize: "26px" } }, "시작.bat을 실행해 주세요."),
        el("p", { class: "tagline" }, "JSON 대화를 불러오려면 폴더에서 시작.bat을 더블클릭하면 됩니다."),
        el("code", {}, "C:\\Users\\USER\\Downloads\\고양꿈제작소_게임\\시작.bat"),
      ]));
      return;
    }
    try {
      await loadData();
      go("title");
    } catch (err) {
      mount(el("section", { class: "screen file-warn" }, [
        el("h1", { style: { fontSize: "24px" } }, "데이터를 열지 못했습니다."),
        el("p", { class: "tagline" }, String(err)),
      ]));
    }
  }

  start();
})();
