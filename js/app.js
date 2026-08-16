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
    return { v: 1, cards: {}, talked: {}, nightDone: false };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(App.data.config.storageKey);
      if (!raw) return blankState();
      const parsed = JSON.parse(raw);
      return parsed && parsed.v === 1 ? parsed : blankState();
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
    const [config, youths, night] = await Promise.all([
      fetch("data/config.json").then((r) => r.json()),
      fetch("data/youths.json").then((r) => r.json()),
      fetch("data/night.json").then((r) => r.json()),
    ]);
    App.data = { config, youths, night };
    App.state = loadState();
  }

  function render() {
    if (App.screen === "title") return mount(viewTitle());
    if (App.screen === "map") return mount(viewMap());
    if (App.screen === "dialogue") return mount(viewDialogue());
    if (App.screen === "card") return mount(viewCard());
    if (App.screen === "album") return mount(viewAlbum());
    if (App.screen === "ending") return mount(viewEnding());
  }

  function go(screen) {
    App.screen = screen;
    render();
  }

  function viewTitle() {
    const hasSave = cardCount() > 0 || App.state.nightDone;
    return el("section", { class: "screen" }, [
      el("div", {
        class: "title-art",
        style: { backgroundImage: "url(assets/places/lobby.jpg)" },
      }),
      el("div", { class: "kicker" }, App.data.config.chapter),
      el("h1", {}, App.data.config.title),
      el("p", { class: "tagline" }, App.data.config.tagline),
      el("div", { class: "title-actions" }, [
        el("button", {
          class: "btn",
          onclick: () => go("map"),
        }, hasSave ? "기록 이어하기" : "문을 연다"),
        hasSave && el("button", {
          class: "btn ghost",
          onclick: () => {
            if (confirm("모은 카드와 대화를 모두 지울까요?")) {
              App.state = blankState();
              saveState();
              go("map");
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

  function viewMap() {
    const count = cardCount();
    const need = App.data.config.unlockNightAt;
    return el("section", { class: "screen" }, [
      el("div", { class: "topbar" }, [
        el("div", {}, [
          el("div", { class: "kicker" }, "낮"),
          el("h2", {}, "고양꿈제작소"),
        ]),
        el("button", { class: "chip", onclick: () => go("album") }, `앨범 ${count}/${need}`),
      ]),
      ...App.data.config.places.map((place) => {
        const locked = place.night && !nightOpen();
        const ready = place.night && nightOpen() && !App.state.nightDone;
        return el("button", {
          class: `place${locked ? " is-locked" : ""}${ready ? " is-ready" : ""}`,
          style: { backgroundImage: `url(${place.image})` },
          onclick: () => openPlace(place),
        }, [
          el("div", { class: "place-body" }, [
            el("div", { class: "place-floor" }, place.floor),
            el("div", { class: "place-name" }, place.name),
            el("div", { class: "place-meta" }, placeStatus(place)),
            locked && el("div", { class: "lock-note" }, `모은 카드 ${count}/${need}`),
          ]),
        ]);
      }),
      el("p", { class: "progress" }, count < need
        ? `청년 카드 ${count}/${need} · 모이면 밤이 열린다`
        : App.state.nightDone
          ? "1장의 수집은 여기까지."
          : "카드 세 장. 폐관 안내가 내려와 있다."),
      count < need && el("p", { class: "hint" }, "장소를 골라 말을 건넨다. 같은 사람도, 어떻게 말하느냐에 따라 카드가 달라진다."),
      nightOpen() && !App.state.nightDone && el("p", { class: "hint" }, "폐관. 주무관이 로비에 남아 있다. 그림이 또 뒤집혀 있다고 한다."),
      App.state.nightDone && el("p", { class: "hint" }, "말은 말렸다. 열쇠는 이미 손에 있다."),
    ]);
  }

  function openPlace(place) {
    if (place.night) {
      if (!nightOpen()) return;
      if (App.state.nightDone) return;
      startStory(App.data.night);
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

  function currentNode() {
    const s = App.session;
    if (s.kind === "youth") {
      const youth = youthById(s.youthId);
      return youth.encounters[s.encIndex].nodes[s.nodeId];
    }
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
    if (!node) return viewMap();
    if (node.bg) App.session.bg = node.bg;
    const speaker = node.speaker || "";
    const canTap = !node.choices;
    const portrait = speaker && speaker !== "나" ? App.session.portrait : "";

    const box = el("section", {
      class: "screen dlg",
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
            go("map");
          },
        }, "← 장소로"),
        el("div", { class: "spacer" }),
        el("div", { class: "row", style: { alignItems: "flex-end", marginBottom: "16px" } }, [
          portrait && el("div", { class: "portrait-wrap" }, [
            el("img", { src: portrait, alt: speaker }),
          ]),
          el("div", {}, [
            speaker && el("div", { class: "speaker-name" }, speaker),
            el("div", { class: "kicker", style: { marginTop: "4px" } },
              App.session.kind === "story" ? "폐관 이후" : "대화"),
          ]),
        ]),
        node.aside && el("p", { class: "aside" }, node.aside),
        el("p", { class: "line" }, nodeText(node)),
        canTap && el("p", { class: "tap-hint" }, node.end ? "터치해서 남긴다" : "터치해서 계속"),
        node.choices && el("div", { class: "choices" },
          node.choices.map((choice) =>
            el("button", {
              class: "choice",
              onclick: (ev) => {
                ev.stopPropagation();
                pickChoice(choice);
              },
            }, choice.text)
          )
        ),
      ]),
    ]);
    return box;
  }

  function viewCard() {
    const r = App.lastReveal;
    if (!r) return viewMap();
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
      el("div", { class: "spacer" }),
      el("button", {
        class: "btn",
        onclick: () => {
          const back = App.returnTo || "map";
          App.lastReveal = null;
          App.returnTo = null;
          go(back);
        },
      }, App.returnTo === "album" ? "앨범으로" : "앨범에 넣는다"),
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
        el("button", { class: "chip", onclick: () => go("map") }, "장소로"),
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
        el("button", { class: "btn ghost", onclick: () => go("map") }, "낮으로 돌아간다"),
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
