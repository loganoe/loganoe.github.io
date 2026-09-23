(() => {
  const root = document.documentElement;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ── Pieces that don't need GSAP ─────────────────────── */

  // Nav link text roll
  $$("[data-roll]").forEach((a) => {
    const t = a.textContent.trim();
    a.innerHTML = `<span class="roll__a">${t}</span><span class="roll__b" aria-hidden="true">${t}</span>`;
  });

  // Reno local time
  const clocks = $$("[data-clock]");
  const fmt = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
  const tickClock = () => clocks.forEach((c) => (c.textContent = fmt.format(new Date())));
  tickClock();
  setInterval(tickClock, 15000);

  // Copy email
  $$("[data-copy]").forEach((btn) => {
    const label = $("[data-copy-label]", btn);
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        label.textContent = "Copied ✓";
      } catch {
        label.textContent = "Press ⌘/Ctrl+C";
      }
      clearTimeout(btn._t);
      btn._t = setTimeout(() => (label.textContent = "Copy"), 1800);
    });
  });

  // Cycloidal disk drawing (v4 card): 10 pins, 9 lobes
  const cyc = $("[data-cycloid]");
  if (cyc) {
    const R = 84, Rr = 7, E = 4, N = 10, steps = 900;
    let d = "";
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      const psi = Math.atan2(Math.sin((1 - N) * t), R / (E * N) - Math.cos((1 - N) * t));
      const x = R * Math.cos(t) - Rr * Math.cos(t + psi) - E * Math.cos(N * t);
      const y = -R * Math.sin(t) + Rr * Math.sin(t + psi) + E * Math.sin(N * t);
      d += `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
    }
    const pins = Array.from({ length: N }, (_, i) => {
      const a = (i / N) * Math.PI * 2;
      return `<circle cx="${(R * Math.cos(a)).toFixed(2)}" cy="${(R * Math.sin(a)).toFixed(2)}" r="${Rr}"/>`;
    }).join("");
    const holes = (r, rad) =>
      Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return `<circle cx="${(rad * Math.cos(a)).toFixed(2)}" cy="${(rad * Math.sin(a)).toFixed(2)}" r="${r}"/>`;
      }).join("");
    cyc.innerHTML = `
      <circle r="102" opacity=".35"/>
      <circle r="96" stroke-dasharray="2 4" opacity=".4"/>
      <g class="pins">${pins}</g>
      <g class="disk"><path d="${d}Z"/>${holes(10, 46)}<circle r="20"/></g>
      <g class="outpins">${holes(10 - E, 46)}</g>
      <g class="shaft"><circle class="accent" cx="${E}" r="15"/><circle r="4"/></g>
      <line x1="-108" x2="108" opacity=".25" stroke-dasharray="8 3 2 3"/>
      <line y1="-108" y2="108" opacity=".25" stroke-dasharray="8 3 2 3"/>`;
  }

  // Lazy videos: load + play only while on screen
  const videos = $$("video[data-autoplay]");
  const vio = new IntersectionObserver(
    (entries) =>
      entries.forEach((en) => {
        const v = en.target;
        const onScreen =
          en.isIntersecting && en.intersectionRect.height > 0 && en.intersectionRect.width > 0 && !v.closest("[inert]");
        if (onScreen) {
          if (!v.getAttribute("src")) v.src = v.dataset.src;
          if (!reduce) v.play().catch(() => {});
        } else if (!v.paused) v.pause();
      }),
    { rootMargin: "120px 0px", threshold: [0, 0.01] }
  );
  videos.forEach((v) => {
    if (reduce) v.controls = true;
    vio.observe(v);
  });
  const recheck = (el) =>
    $$("video[data-autoplay]", el).forEach((v) => {
      vio.unobserve(v);
      vio.observe(v);
    });

  // Full demo modal
  const dialog = $("[data-demo]");
  const demo = $("video", dialog);
  let lenis;
  const openDemo = () => {
    if (!demo.getAttribute("src")) demo.src = demo.dataset.src;
    dialog.showModal();
    lenis?.stop();
    demo.currentTime = 0;
    demo.play().catch(() => {});
    window.gsap && !reduce && gsap.fromTo(dialog, { autoAlpha: 0, y: 24, scale: 0.97 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.8, ease: "expo.out" });
  };
  const closeDemo = () => dialog.open && dialog.close();
  $$("[data-open-demo]").forEach((b) => b.addEventListener("click", openDemo));
  $("[data-close-demo]").addEventListener("click", closeDemo);
  dialog.addEventListener("click", (e) => e.target === dialog && closeDemo());
  dialog.addEventListener("close", () => {
    demo.pause();
    lenis?.start();
  });

  // Accordion
  $$("[data-row]").forEach((row) => {
    const head = $(".row__head", row);
    const body = $(".row__body", row);
    head.addEventListener("click", () => {
      const open = head.getAttribute("aria-expanded") !== "true";
      head.setAttribute("aria-expanded", String(open));
      if (open) {
        $$("img[data-src]", body).forEach((img) => {
          img.src = img.dataset.src;
          img.removeAttribute("data-src");
        });
        recheck(body);
      } else {
        $$("video", body).forEach((v) => v.pause());
      }
    });
    body.addEventListener("transitionend", (e) => {
      if (e.propertyName === "grid-template-rows") {
        window.ScrollTrigger?.refresh();
        recheck(body);
      }
    });
  });

  // Arm v7: teleop leads; the policy demo only appears when asked for
  const sw = $("[data-demo-switch]");
  if (sw) {
    const slides = $$(".demo__slide", sw);
    const label = $("[data-demo-label]", sw);
    const text = $("[data-demo-text]", sw);
    const btn = $("[data-demo-next]", sw);
    const btnLabel = $("[data-demo-btn]", sw);
    const copy = [
      ["Teleop", text.textContent, "Policy demo", "Show the autonomous policy demo"],
      ["SmolVLA · 3×", "Autonomous policy, trained on ~30 teleop episodes.", "Teleop", "Back to the teleoperation demo"],
    ];
    let at = 0;
    sw.dataset.at = "0";
    btn.addEventListener("click", () => {
      const next = at === 0 ? 1 : 0;
      const from = slides[at], to = slides[next];
      sw.dataset.dir = next > at ? "fwd" : "back";
      $$("video", from).forEach((v) => v.pause());
      from.classList.add("is-leaving");
      from.classList.remove("is-active");
      from.setAttribute("aria-hidden", "true");
      from.inert = true;
      to.removeAttribute("aria-hidden");
      to.inert = false;
      // force the start clip before activating so the wipe runs
      void to.offsetWidth;
      to.classList.add("is-active");
      const v = $("video", to);
      if (!v.getAttribute("src")) v.src = v.dataset.src;
      v.currentTime = 0;
      if (!reduce) v.play().catch(() => {});
      const done = () => from.classList.remove("is-leaving");
      setTimeout(done, reduce ? 0 : 1150);
      at = next;
      sw.dataset.at = String(at);
      [label.textContent, text.textContent, btnLabel.textContent] = copy[at];
      btn.setAttribute("aria-label", copy[at][3]);
    });
  }

  // Anatomy state (works with or without GSAP)
  const fig = $("[data-anatomy]");
  const steps = $$(".step");
  const spots = $$("[data-spot]");
  const figLabel = $("[data-anatomy-label]");
  const stepNames = ["Arm", "Lift", "Drivebase", "Compute"];
  const setStep = (i) => {
    if (!fig || fig.dataset.active === String(i)) return;
    fig.dataset.active = String(i);
    steps.forEach((s, j) => s.classList.toggle("is-active", j === i));
    spots.forEach((s, j) => s.classList.toggle("is-active", j === i));
    if (figLabel) figLabel.textContent = `0${i + 1} / ${stepNames[i]}`;
  };
  fig && ((fig.dataset.active = ""), setStep(0));

  /* ── GSAP ────────────────────────────────────────────── */

  if (!window.gsap || !window.ScrollTrigger) {
    root.classList.add("is-ready");
    return;
  }
  gsap.registerPlugin(ScrollTrigger, SplitText);

  if (!reduce && window.Lenis) {
    lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1, touchMultiplier: 1.4 });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  // Anchor links go through Lenis
  $$('a[href^="#"]').forEach((a) =>
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      const el = id === "#top" ? document.body : $(id);
      if (!el) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(id === "#top" ? 0 : el, { duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4) });
      else el.scrollIntoView();
      history.replaceState(null, "", id === "#top" ? location.pathname : id);
    })
  );

  // Progress bar + hide nav on scroll down
  const nav = $("[data-nav]");
  const bar = $(".progress span");
  let lastY = 0;
  ScrollTrigger.create({
    start: 0,
    end: "max",
    onUpdate(self) {
      bar.style.transform = `scaleX(${self.progress.toFixed(4)})`;
      const y = self.scroll();
      if (Math.abs(y - lastY) > 6) {
        nav.classList.toggle("is-hidden", y > lastY && y > innerHeight * 0.5);
        lastY = y;
      }
    },
  });

  // Dark sections flip the page theme
  const themeMeta = $('meta[name="theme-color"]');
  const themeTriggers = () =>
    $$('[data-theme="dark"]').forEach((sec) =>
      ScrollTrigger.create({
        trigger: sec,
        start: "top 50%",
        end: "bottom 50%",
        onToggle(self) {
          root.classList.toggle("is-dark", self.isActive);
          themeMeta.content = self.isActive ? "#0f0f0e" : "#f1f0eb";
        },
      })
    );

  const init = () => {
    /* Intro */
    const title = $("[data-hero-title]");
    const intro = gsap.timeline({ delay: 0.1 });
    if (reduce) {
      window.heroArm?.start();
    } else {
      const split = SplitText.create(title, { type: "chars,lines", mask: "lines", linesClass: "line" });
      intro
        .from(split.chars, { yPercent: 118, duration: 1.5, ease: "expo.out", stagger: 0.032 }, 0)
        .from(".hero__frame", { autoAlpha: 0, scale: 1.015, duration: 1.4, ease: "expo.out" }, 0)
        .from("[data-intro]", { y: 16, autoAlpha: 0, duration: 1.1, ease: "power3.out", stagger: 0.06 }, 0.45)
        .from(nav, { autoAlpha: 0, duration: 1.2, ease: "power2.out" }, 0.4)
        .fromTo(".hero__canvas", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5 }, 0.25)
        .call(() => window.heroArm?.start(), null, 0.25);

      // Hero drifts up and softens as you leave it
      gsap.to(".hero__body", {
        yPercent: -18,
        opacity: 0.15,
        ease: "none",
        scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
      });
      gsap.to(".hero__canvas", {
        yPercent: 12,
        ease: "none",
        scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
      });
    }
    root.classList.add("is-ready");

    if (reduce) {
      themeTriggers();
      return;
    }

    // Pin first: every trigger created after it accounts for the pin spacing
    /* Lineage: vertical scroll drives a horizontal track */
    const pin = $("[data-lineage]");
    const track = $("[data-lineage-track]");
    const railBar = $("[data-lineage-bar]");
    gsap.matchMedia().add("(min-width: 900px)", () => {
      pin.style.height = "100vh";
      pin.style.justifyContent = "center";
      const dist = () => Math.max(0, track.scrollWidth - innerWidth);
      const tween = gsap.to(track, {
        x: () => -dist(),
        ease: "none",
        scrollTrigger: {
          trigger: pin,
          start: "top top",
          end: () => `+=${dist()}`,
          pin: true,
          scrub: 0.9,
          invalidateOnRefresh: true,
          anticipatePin: 1,
          onUpdate: (self) => (railBar.style.transform = `scaleX(${self.progress.toFixed(4)})`),
        },
      });
      // each card's media drifts inside its frame
      $$(".gen__media > *", track).forEach((m) => {
        gsap.set(m, { scale: 1.18 });
        gsap.fromTo(
          m,
          { xPercent: 7 },
          {
            xPercent: -7,
            ease: "none",
            scrollTrigger: {
              trigger: m.parentElement,
              containerAnimation: tween,
              start: "left right",
              end: "right left",
              scrub: true,
            },
          }
        );
      });
      gsap.from($$(".gen", track), {
        x: 120,
        autoAlpha: 0,
        duration: 1.4,
        ease: "expo.out",
        stagger: 0.08,
        scrollTrigger: { trigger: pin, start: "top 75%", once: true },
      });
      return () => {
        pin.style.height = "";
        pin.style.justifyContent = "";
      };
    });

    themeTriggers();

    /* Generic reveals */
    $$('[data-reveal="fade"]').forEach((el) =>
      gsap.from(el, {
        y: 22,
        autoAlpha: 0,
        duration: 1.1,
        ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 90%", once: true },
      })
    );

    $$('[data-reveal="lines"]').forEach((el) =>
      SplitText.create(el, {
        type: "lines",
        mask: "lines",
        linesClass: "line",
        autoSplit: true,
        onSplit: (self) =>
          gsap.from(self.lines, {
            yPercent: 115,
            duration: 1.3,
            ease: "expo.out",
            stagger: 0.09,
            scrollTrigger: { trigger: el, start: "top 88%", once: true },
          }),
      })
    );

    $$("[data-scrub-words]").forEach((el) =>
      SplitText.create(el, {
        type: "words",
        wordsClass: "word",
        autoSplit: true,
        onSplit: (self) =>
          gsap.to(self.words, {
            opacity: 1,
            ease: "none",
            stagger: 0.1,
            scrollTrigger: { trigger: el, start: "top 78%", end: "bottom 52%", scrub: 0.6 },
          }),
      })
    );

    $$('[data-reveal="stagger"], [data-reveal="rows"]').forEach((el) =>
      gsap.from(el.children, {
        y: 34,
        autoAlpha: 0,
        duration: 1.1,
        ease: "power3.out",
        stagger: 0.08,
        scrollTrigger: { trigger: el, start: "top 88%", once: true },
      })
    );

    $$('[data-reveal="demo"]').forEach((el) => {
      const stage = $(".demo__stage", el);
      const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: "top 85%", once: true } });
      tl.fromTo(
        stage,
        { clipPath: "inset(18% 10% 0% 10% round 28px)" },
        { clipPath: "inset(0% 0% 0% 0% round 18px)", duration: 1.6, ease: "expo.inOut" }
      )
        .from($("video", stage), { scale: 1.3, duration: 2, ease: "expo.out", clearProps: "transform" }, 0.1)
        .from($$(".demo__bar > *", el), { y: 18, autoAlpha: 0, duration: 1, ease: "power3.out", stagger: 0.1 }, 0.9);
    });

    // Count-up stats
    $$("[data-count]").forEach((el) => {
      const end = +el.dataset.count;
      const o = { v: 0 };
      gsap.to(o, {
        v: end,
        duration: 2,
        ease: "expo.out",
        scrollTrigger: { trigger: el, start: "top 90%", once: true },
        onUpdate: () => (el.textContent = Math.round(o.v)),
      });
    });

    /* DUM-E */
    const dt = $("[data-dume-title]");
    gsap.from($$("span", dt), {
      yPercent: 102,
      ease: "power3.out",
      stagger: 0.12,
      scrollTrigger: { trigger: dt, start: "top 98%", end: "bottom 55%", scrub: 0.8 },
    });

    const mm = gsap.matchMedia();
    const stage = $("[data-dume-stage]");
    const vfig = $("[data-dume-video]");
    mm.add(
      { desk: "(min-width: 821px)", mob: "(max-width: 820px)" },
      (c) => {
        const inset = c.conditions.desk ? "10% 16% 10% 16%" : "6% 4% 6% 4%";
        gsap.fromTo(
          vfig,
          { clipPath: `inset(${inset} round 28px)` },
          {
            clipPath: "inset(0% 0% 0% 0% round 18px)",
            ease: "none",
            scrollTrigger: { trigger: stage, start: "top 92%", end: "top 12%", scrub: true },
          }
        );
        gsap.fromTo(
          $("video", vfig),
          { scale: 1.25 },
          { scale: 1, ease: "none", scrollTrigger: { trigger: stage, start: "top 92%", end: "top 12%", scrub: true } }
        );
        gsap.from($$("figcaption > *", vfig), {
          y: 20,
          autoAlpha: 0,
          stagger: 0.1,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: { trigger: stage, start: "top 30%", once: true },
        });
      }
    );

    // Anatomy: active step follows scroll
    steps.forEach((st, i) =>
      ScrollTrigger.create({
        trigger: st,
        start: "top 60%",
        end: "bottom 60%",
        onToggle: (self) => self.isActive && setStep(i),
      })
    );
    gsap.from(".anatomy__img", {
      clipPath: "inset(12% 12% 12% 12% round 14px)",
      duration: 1.6,
      ease: "expo.out",
      scrollTrigger: { trigger: ".anatomy", start: "top 80%", once: true },
    });

    // Pipeline: nodes enter, then a pulse runs through them
    const flow = $("[data-pipeline]");
    if (flow) {
      const nodes = $$(".node", flow);
      const pulse = document.createElement("span");
      pulse.className = "pipeline__pulse";
      pulse.setAttribute("aria-hidden", "true");
      flow.prepend(pulse);
      gsap.from(nodes, {
        y: 30,
        autoAlpha: 0,
        duration: 1,
        ease: "power3.out",
        stagger: 0.1,
        scrollTrigger: { trigger: flow, start: "top 85%", once: true },
      });
      mm.add({ desk: "(min-width: 821px)", mob: "(max-width: 820px)" }, (c) => {
        const horiz = c.conditions.desk;
        const size = () => (horiz ? flow.offsetWidth : flow.offsetHeight);
        const pl = horiz ? 90 : 70;
        const dur = 4.2;
        const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.6, paused: true });
        tl.set(pulse, { opacity: 1 });
        tl.fromTo(
          pulse,
          { [horiz ? "x" : "y"]: -pl },
          { [horiz ? "x" : "y"]: () => size(), duration: dur, ease: "none" },
          0
        );
        nodes.forEach((n, i) => {
          const at = () => {
            const pos = horiz ? n.offsetLeft : n.offsetTop;
            return (dur * (pos + pl / 2 + 4)) / (size() + pl);
          };
          tl.call(() => n.classList.add("is-lit"), null, at());
          tl.call(() => n.classList.remove("is-lit"), null, Math.min(dur, at() + 0.9));
        });
        tl.set(pulse, { opacity: 0 });
        const st = ScrollTrigger.create({
          trigger: flow,
          start: "top 80%",
          end: "bottom 10%",
          onToggle: (self) => (self.isActive ? tl.play() : tl.pause()),
        });
        return () => {
          st.kill();
          nodes.forEach((n) => n.classList.remove("is-lit"));
        };
      });
    }

    /* Magnetic buttons */
    if (finePointer) {
      $$("[data-magnetic]").forEach((el) => {
        const xTo = gsap.quickTo(el, "x", { duration: 0.6, ease: "power3.out" });
        const yTo = gsap.quickTo(el, "y", { duration: 0.6, ease: "power3.out" });
        el.addEventListener("pointermove", (e) => {
          const r = el.getBoundingClientRect();
          xTo((e.clientX - r.left - r.width / 2) * 0.25);
          yTo((e.clientY - r.top - r.height / 2) * 0.35);
        });
        el.addEventListener("pointerleave", () => {
          gsap.to(el, { x: 0, y: 0, duration: 1.1, ease: "elastic.out(1, 0.4)" });
        });
      });
    }

    ScrollTrigger.refresh();
  };

  // Wait for fonts so line splits measure the real typeface
  const fontsReady = document.fonts ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]) : Promise.resolve();
  fontsReady.then(init);
})();
