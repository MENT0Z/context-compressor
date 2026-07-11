class ChatParser {
    static getPlatform() {
        const host = window.location.hostname;
        if (host.includes("chatgpt.com") || host.includes("chat.openai.com")) return "chatgpt";
        if (host.includes("gemini.google.com")) return "gemini";
        if (host.includes("claude.ai")) return "claude";
        return "unknown";
    }

    static getConversationId() {
        let arr = window.location.pathname.split("/");
        return arr[arr.length - 1];
    }

    static _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static _getChatScroller() {
        const allDivs = [...document.querySelectorAll("div")];
        const viewH = window.innerHeight;
        const viewW = window.innerWidth;
        let best = null, bestScore = -1;

        for (const el of allDivs) {
            const style = window.getComputedStyle(el);
            if (style.overflowY !== "auto" && style.overflowY !== "scroll") continue;
            if (el.scrollHeight <= el.clientHeight) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width < 200 || rect.height < 200) continue;

            let score = 0;
            score += (el.scrollHeight / viewH) * 10;
            score += (rect.width / viewW) * 10;
            const distFromCenter = Math.abs((rect.left + rect.width / 2) - viewW / 2);
            score += (1 - distFromCenter / viewW) * 15;
            if (el.querySelector("[data-message-author-role]")) score += 50;
            if (el.querySelector('[data-testid="user-message"]')) score += 50;
            if (el.querySelector("user-query, model-response")) score += 50;
            if (rect.width < 300) score -= 20;

            if (score > bestScore) { bestScore = score; best = el; }
        }

        return best || document.documentElement;
    }

    // ─── CORE FIX: observe while scrolling, cache every message as it mounts ──
    static async _scrapeWithObserver() {
        // messageId → {role, text} — keyed by a stable ID so duplicates are ignored
        const cache = new Map();

        function extractFromNode(node) {
            // Only interested in element nodes
            if (node.nodeType !== 1) return;

            // Check the node itself and all descendants for message elements
            const candidates = [
                node.matches?.("[data-message-author-role]") ? node : null,
                ...node.querySelectorAll("[data-message-author-role]"),
            ].filter(Boolean);

            candidates.forEach(el => {
                // Use the element's data-message-id as the dedup key if present,
                // otherwise fall back to role+first-50-chars (covers older UI versions)
                const id  = el.closest("[data-message-id]")?.dataset?.messageId
                          || (el.dataset.messageAuthorRole + "|" + el.innerText.slice(0, 50));
                const text = el.innerText.trim();
                if (!text) return;

                if (!cache.has(id)) {
                    cache.set(id, {
                        role:      el.dataset.messageAuthorRole,
                        text,
                        // Store the DOM order index so we can sort at the end
                        _order:    cache.size,
                    });
                }
            });
        }

        // Observe the whole document for any message node being added
        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                mutation.addedNodes.forEach(extractFromNode);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        // Also snapshot what's already visible before we start scrolling
        document.querySelectorAll("[data-message-author-role]").forEach(el => {
            extractFromNode(el);
        });

        // ── Now do the scroll ──────────────────────────────────────────────────
        const scroller   = this._getChatScroller();
        const scrollStep = 400;   // smaller steps = less chance of skipping a render window
        const settlDelay = 200;   // give React time to mount each batch
        const endGuardMax = 8;
        let   endGuard   = 0;

        scroller.scrollTop = 0;
        await this._sleep(700);   // wait for top messages to mount

        while (true) {
            const before = scroller.scrollTop;
            scroller.scrollTop += scrollStep;
            await this._sleep(settlDelay);
            const after = scroller.scrollTop;

            if (after <= before) {
                endGuard++;
                if (endGuard >= endGuardMax) break;
            } else {
                endGuard = 0;
            }
        }

        await this._sleep(500);
        observer.disconnect();

        console.log(`ChatParser: observer captured ${cache.size} unique messages`);

        // Sort by _order (insertion order = DOM appearance order during scroll)
        return [...cache.values()]
            .sort((a, b) => a._order - b._order)
            .map(({ role, text }) => ({
                role,
                text,
                timestamp: new Date().toISOString(),
            }));
    }

    static async getMessages() {
        let msgs = [];
        const platform = this.getPlatform();

        if (platform === "chatgpt") {
            // ChatGPT virtualizes — must observe while scrolling
            msgs = await this._scrapeWithObserver();
        }

        else if (platform === "gemini") {
            await this._forceRenderAllMessages();
            document.querySelectorAll("user-query, model-response").forEach((e) => {
                const isUser = e.tagName.toLowerCase() === "user-query";
                const inner  = e.querySelector('.message-content, .text-content, [data-test-id="message-content"]');
                const text   = (inner ?? e).innerText.trim();
                if (!text) return;
                msgs.push({ role: isUser ? "user" : "assistant", text, timestamp: new Date().toISOString() });
            });
        }

        else if (platform === "claude") {
            await this._forceRenderAllMessages();

            const userMsgs = document.querySelectorAll('[data-testid="user-message"]');
            const asstMsgs = document.querySelectorAll('[data-testid="assistant-message"]');

            if (userMsgs.length > 0 || asstMsgs.length > 0) {
                const all = [
                    ...Array.from(userMsgs).map(e => ({ el: e, role: "user" })),
                    ...Array.from(asstMsgs).map(e => ({ el: e, role: "assistant" })),
                ].sort((a, b) =>
                    a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
                );
                all.forEach(({ el, role }) => {
                    const text = el.innerText.trim();
                    if (!text) return;
                    msgs.push({ role, text, timestamp: new Date().toISOString() });
                });

            } else {
                const turns = document.querySelectorAll('[class*="human-turn"], [class*="assistant-turn"]');
                if (turns.length > 0) {
                    turns.forEach(el => {
                        const isAsst = [...el.classList].some(c => c.includes("assistant-turn"));
                        const text   = el.innerText.trim();
                        if (!text) return;
                        msgs.push({ role: isAsst ? "assistant" : "user", text, timestamp: new Date().toISOString() });
                    });
                } else {
                    const scope = document.querySelector("main") || document;
                    const prose = Array.from(scope.querySelectorAll(".prose"))
                        .filter(el => el.innerText.trim().length > 1);
                    const user  = Array.from(scope.querySelectorAll(".whitespace-pre-wrap"))
                        .filter(el => el.innerText.trim().length > 1 && !el.closest(".prose"));

                    [...prose.map(el => ({ el, role: "assistant" })),
                     ...user.map(el => ({ el, role: "user" }))]
                        .sort((a, b) =>
                            a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
                        )
                        .forEach(({ el, role }) => {
                            const text = el.innerText.trim();
                            if (!text) return;
                            msgs.push({ role, text, timestamp: new Date().toISOString() });
                        });
                }
            }
        }

        else {
            console.warn("ChatParser: Unsupported platform.");
        }

        console.log(`ChatParser: returning ${msgs.length} messages`);
        return msgs;
    }

    // kept for Gemini/Claude (they don't virtualize aggressively)
    static async _forceRenderAllMessages() {
        const scroller   = this._getChatScroller();
        const platform   = this.getPlatform();
        const settlDelay = platform === "gemini" ? 250 : 150;
        const scrollStep = 500;
        const endGuardMax = 6;
        let   endGuard = 0;

        scroller.scrollTop = 0;
        await this._sleep(600);

        while (true) {
            const before = scroller.scrollTop;
            scroller.scrollTop += scrollStep;
            await this._sleep(settlDelay);
            const after = scroller.scrollTop;

            if (after <= before) {
                endGuard++;
                if (endGuard >= endGuardMax) break;
            } else {
                endGuard = 0;
            }
        }

        await this._sleep(400);
    }
}