// ─── Proof Verifier UI ───
            let proofRunning = false;

            function log(html) {
                const el = document.getElementById("proof-log");
                el.innerHTML += html + "<br>";
                el.scrollTop = el.scrollHeight;
            }

            function formatNum(n) {
                return n.toLocaleString();
            }

            async function startProof() {
                if (proofRunning) return;
                proofRunning = true;

                const btn = document.getElementById("proof-run-btn");
                const status = document.getElementById("proof-status");
                const progress = document.getElementById("proof-progress");
                const progressBar =
                    document.getElementById("proof-progress-bar");
                const logEl = document.getElementById("proof-log");
                const results = document.getElementById("proof-results");
                const graphBody = document.getElementById("graph-results-body");
                const dynBody = document.getElementById("dyn-results-body");
                const verdict = document.getElementById("proof-verdict");

                btn.disabled = true;
                btn.classList.add("running");
                btn.textContent = "Running...";
                progress.classList.add("active");
                logEl.classList.add("active");
                logEl.innerHTML = "";
                graphBody.innerHTML = "";
                dynBody.innerHTML = "";
                results.classList.add("visible");
                verdict.classList.remove("visible");

                // Total objects for progress: graphs(n=2..5) + dynamics(n=2..7)
                const graphTotals = [0, 0, 4, 64, 4096, 1048576]; // 2^(n*(n-1))
                const dynTotals = [0, 0, 4, 27, 256, 3125, 46656, 823543];
                const totalGraphs = graphTotals
                    .slice(2, 6)
                    .reduce((a, b) => a + b, 0);
                const totalDyn = dynTotals
                    .slice(2, 8)
                    .reduce((a, b) => a + b, 0);
                const grandTotal = totalGraphs + totalDyn;
                let globalChecked = 0;

                log(
                    '<span class="log-phase">PART 1: DIRECTED GRAPHS (n=2..5)</span>',
                );
                log(
                    '<span class="log-info">Verifying: κ(G) > 0 ⟺ β₁(G) > 0 ⟺ has nontrivial SCC</span>',
                );

                const result = await runFullProof((update) => {
                    if (update.step === "start") {
                        if (update.phase === "graphs") {
                            status.textContent = `Graphs n=${update.n}...`;
                        } else {
                            status.textContent = `Dynamical systems n=${update.n}...`;
                        }
                    } else if (update.step === "progress") {
                        const phaseOffset =
                            update.phase === "dynamics" ? totalGraphs : 0;
                        const prevN =
                            update.phase === "graphs"
                                ? graphTotals
                                      .slice(2, update.n)
                                      .reduce((a, b) => a + b, 0)
                                : dynTotals
                                      .slice(2, update.n)
                                      .reduce((a, b) => a + b, 0);
                        globalChecked = phaseOffset + prevN + update.checked;
                        const pct = (
                            (globalChecked / grandTotal) *
                            100
                        ).toFixed(1);
                        progressBar.style.width = pct + "%";
                        status.textContent = `${update.phase === "graphs" ? "Graphs" : "Dynamics"} n=${update.n}: ${formatNum(update.checked)}/${formatNum(update.total)}`;
                    } else if (update.step === "done") {
                        const r = update.result;
                        const statusClass = r.failures === 0 ? "pass" : "fail";
                        const statusText = r.failures === 0 ? "PASS" : "FAIL";

                        if (update.phase === "graphs") {
                            const pearson =
                                r.pearsonR !== null
                                    ? r.pearsonR.toFixed(4)
                                    : "N/A";
                            graphBody.innerHTML += `<tr>
                                <td>${r.n}</td>
                                <td class="num">${formatNum(r.numGraphs)}</td>
                                <td class="num">${formatNum(r.scGraphs)}</td>
                                <td class="num">${r.failures}</td>
                                <td class="num">${pearson}</td>
                                <td class="num">${formatNum(r.elapsed)}ms</td>
                                <td class="${statusClass}">${statusText}</td>
                            </tr>`;
                            log(
                                `<span class="log-pass">  n=${r.n}: ${formatNum(r.numGraphs)} graphs, ${formatNum(r.scGraphs)} SC, fails=${r.failures}, r(κ,β₁)=${pearson}, ${formatNum(r.elapsed)}ms [${statusText}]</span>`,
                            );

                            if (r.n === 5) {
                                log("");
                                log(
                                    '<span class="log-phase">PART 2: FINITE DYNAMICAL SYSTEMS (n=2..7)</span>',
                                );
                                log(
                                    '<span class="log-info">Verifying: κ(f) > 0 ⟺ has periodic orbit (period > 1)</span>',
                                );
                            }
                        } else {
                            dynBody.innerHTML += `<tr>
                                <td>${r.n}</td>
                                <td class="num">${formatNum(r.numMaps)}</td>
                                <td class="num">${formatNum(r.periodicMaps)}</td>
                                <td class="num">${r.failures}</td>
                                <td class="num">${formatNum(r.elapsed)}ms</td>
                                <td class="${statusClass}">${statusText}</td>
                            </tr>`;
                            log(
                                `<span class="log-pass">  n=${r.n}: ${formatNum(r.numMaps)} maps, ${formatNum(r.periodicMaps)} periodic, fails=${r.failures}, ${formatNum(r.elapsed)}ms [${statusText}]</span>`,
                            );
                        }
                    }
                });

                // Show verdict
                progressBar.style.width = "100%";
                verdict.classList.add("visible");

                if (result.totalFailures === 0) {
                    verdict.className = "proof-verdict visible verified";
                    verdict.innerHTML = `<div class="verdict-title">VERIFIED</div>
                        ${formatNum(result.totalObjects)} objects tested, 0 counterexamples. ${formatNum(result.elapsed)}ms total.
                        <br>κ(G) > 0 ⟺ β₁(G) > 0 ⟺ has nontrivial SCC (all directed graphs n≤5).
                        <br>κ(f) > 0 ⟺ has periodic orbit of period > 1 (all f:[n]→[n], n≤7).`;
                    log("");
                    log(
                        `<span class="log-pass">VERIFIED: ${formatNum(result.totalObjects)} objects, 0 counterexamples, ${formatNum(result.elapsed)}ms.</span>`,
                    );
                } else {
                    verdict.className = "proof-verdict visible failed";
                    verdict.innerHTML = `<div class="verdict-title">FAILED</div>
                        ${result.totalFailures} counterexamples found in ${formatNum(result.totalObjects)} objects.`;
                }

                btn.disabled = false;
                btn.classList.remove("running");
                btn.textContent = "Run Again";
                status.textContent = "Complete.";
                proofRunning = false;
            }

            // Scroll reveal
            const observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                            entry.target.classList.add("visible");
                        }
                    });
                },
                { threshold: 0.1, rootMargin: "0px 0px -40px 0px" },
            );

            document
                .querySelectorAll(".reveal")
                .forEach((el) => observer.observe(el));

            // ─── Spine scrollspy — highlight the active section in the rail ───
            (function spineScrollspy() {
                const links = Array.from(
                    document.querySelectorAll(".spine a[data-spine]"),
                );
                if (!links.length) return;
                const sections = links
                    .map((a) => document.getElementById(a.dataset.spine))
                    .filter(Boolean);

                function setActive(id) {
                    links.forEach((a) =>
                        a.classList.toggle("active", a.dataset.spine === id),
                    );
                }

                const spy = new IntersectionObserver(
                    (entries) => {
                        // pick the entry nearest the top that is intersecting
                        const visible = entries
                            .filter((e) => e.isIntersecting)
                            .sort(
                                (a, b) =>
                                    a.boundingClientRect.top -
                                    b.boundingClientRect.top,
                            );
                        if (visible.length && visible[0].target.id) {
                            setActive(visible[0].target.id);
                        }
                    },
                    { rootMargin: "-45% 0px -50% 0px", threshold: 0 },
                );
                sections.forEach((s) => spy.observe(s));
            })();
