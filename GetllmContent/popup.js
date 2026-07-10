// popup.js

let extractedData  = null;
let currentResult  = null;

// ── Utils ─────────────────────────────────────────────────────

function setStatus(msg, type = "info") {
    const el = document.getElementById("status");
    el.textContent = msg;
    el.className   = `status ${type}`;
    el.classList.remove("hidden");
}
function clearStatus() {
    const el = document.getElementById("status");
    el.className = "status hidden";
    el.textContent = "";
}

// ── Accordion renderer ────────────────────────────────────────

const SECTION_META = {
    goal:                { label: "Goal",               icon: "🎯" },
    currentState:        { label: "Current state",      icon: "📍" },
    decisions:           { label: "Decisions",          icon: "✅" },
    unresolvedQuestions: { label: "Unresolved questions", icon: "❓" },
    codeBlocks:          { label: "Code blocks",        icon: "💻" },
};

function buildAccordion(data) {
    if (typeof data === "string") {
        data = JSON.parse(data);
    }
    console.log("buildAccordion called with data:", data);
    const container = document.getElementById("accordion");
    console.log("container =", container);
    console.log("resultArea =", document.getElementById("resultArea"));
    
    container.innerHTML = "";

    const order = ["goal", "currentState", "decisions", "unresolvedQuestions", "codeBlocks"];

    console.log("typeof data =", typeof data);
    console.log("data =", data);
    console.log("keys =", Object.keys(data));
    console.log("goal direct =", data.goal);
    console.log("goal bracket =", data["goal"]);
    console.log("hasOwn =", Object.prototype.hasOwnProperty.call(data, "goal"));

    for (const key of order) {
        console.log("Checking key:", key);
        const value = data[key];
        console.log("value =", value);
        if (!value){ 
            console.log("Skipping key:", key);
            continue;
        }
        // Check emptiness
        if (Array.isArray(value) && value.length === 0) {
            console.log("Skipped empty array");
            continue;
        }

        if (
            typeof value === "object" &&
            !Array.isArray(value) &&
            Object.keys(value).length === 0
        ) {
            console.log("Skipped empty object");
            continue;
        }

        if (typeof value === "string" && !value.trim()) {
            console.log("Skipped empty string");
            continue;
        }
        console.log("Rendering", key);
        
        const meta = SECTION_META[key] || { label: key, icon: "•" };

        const item = document.createElement("div");
        item.className = "acc-item";

        // ── Header (always visible) ──
        const header = document.createElement("button");
        header.className = "acc-header";
        header.setAttribute("aria-expanded", "false");
        header.innerHTML = `
            <span class="acc-icon" aria-hidden="true">${meta.icon}</span>
            <span class="acc-label">${meta.label}</span>
            <svg class="acc-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9"/>
            </svg>`;

        // ── Body (hidden by default) ──
        const body = document.createElement("div");
        body.className = "acc-body";

        if (key === "codeBlocks") {
            buildCodeBlocks(body, value);
        } else if (Array.isArray(value)) {
            const ul = document.createElement("ul");
            value.forEach(item => {
                const li = document.createElement("li");
                li.textContent = item;
                ul.appendChild(li);
            });
            body.appendChild(ul);
        } else {
            const p = document.createElement("p");
            p.textContent = value;
            body.appendChild(p);
        }

        // Toggle on click
        header.addEventListener("click", () => {
            const isOpen = header.getAttribute("aria-expanded") === "true";
            header.setAttribute("aria-expanded", String(!isOpen));
            body.classList.toggle("open", !isOpen);
        });

        item.appendChild(header);
        item.appendChild(body);
        console.log("Before append:", container.children.length);
        container.appendChild(item);
        console.log("After append:", container.children.length);
    }
    console.log("Accordion HTML:", container.innerHTML);

    console.log(document.getElementById("accordion"));
    console.log(document.getElementById("resultArea"));
    console.log(document.getElementById("accordion").outerHTML);
    console.log(document.getElementById("accordion").children.length);
    console.log(document.getElementById("accordion").isConnected);
}

function buildCodeBlocks(container, codeBlocks) {
    const refs = Object.entries(codeBlocks);
    if (refs.length === 0) {
        container.innerHTML = "<p>No code blocks.</p>";
        return;
    }

    refs.forEach(([ref, block], i) => {
        const wrap = document.createElement("div");
        wrap.className = "code-item";

        const toggle = document.createElement("button");
        toggle.className = "code-toggle";
        toggle.setAttribute("aria-expanded", "false");
        toggle.innerHTML = `
            <span class="code-badge">Code ${i + 1}</span>
            <span class="code-desc">${block.language} — ${block.description}</span>
            <svg class="acc-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9"/>
            </svg>`;

        const pre = document.createElement("div");
        pre.className = "code-body";
        pre.innerHTML = `<pre><code>${escapeHTML(block.code)}</code></pre>`;

        toggle.addEventListener("click", () => {
            const isOpen = toggle.getAttribute("aria-expanded") === "true";
            toggle.setAttribute("aria-expanded", String(!isOpen));
            pre.classList.toggle("open", !isOpen);
        });

        wrap.appendChild(toggle);
        wrap.appendChild(pre);
        container.appendChild(wrap);
    });
}

function escapeHTML(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function showResult(data) {
    currentResult = data;
    document.getElementById("resultArea").classList.remove("hidden");
    console.log("showResult sent data:", data);
    buildAccordion(data);
}

// ── Copy to clipboard ─────────────────────────────────────────
// Copies everything EXCEPT codeBlocks; for code, writes lang + description instead.

document.getElementById("copyBtn").addEventListener("click", () => {
    if (!currentResult) return;

    const lines = [];

    if (currentResult.goal) {
        lines.push("GOAL", currentResult.goal, "");
    }
    if (currentResult.currentState) {
        lines.push("CURRENT STATE", currentResult.currentState, "");
    }
    if (currentResult.decisions?.length) {
        lines.push("DECISIONS");
        currentResult.decisions.forEach(d => lines.push(`• ${d}`));
        lines.push("");
    }
    if (currentResult.unresolvedQuestions?.length) {
        lines.push("UNRESOLVED QUESTIONS");
        currentResult.unresolvedQuestions.forEach(q => lines.push(`• ${q}`));
        lines.push("");
    }

    // Code blocks: desc + lang only, no code
    const codeEntries = Object.entries(currentResult.codeBlocks || {});
    if (codeEntries.length) {
        lines.push("CODE BLOCKS");
        codeEntries.forEach(([, block], i) => {
            lines.push(`  Code ${i + 1}: [${block.language}] ${block.description}`);
        });
        lines.push("");
    }

    navigator.clipboard.writeText(lines.join("\n")).then(() => {
        const btn = document.getElementById("copyBtn");
        btn.textContent = "Copied!";
        setTimeout(() => {
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy`;
        }, 1800);
    });
});

// ── History ───────────────────────────────────────────────────

function saveToHistory(data, meta) {
    chrome.storage.local.get(["history"], (res) => {
        const history = res.history || [];
        history.unshift({
            id:        Date.now(),
            title:     meta.title || "Untitled",
            url:       meta.url   || "",
            timestamp: new Date().toISOString(),
            data,
        });
        // Keep last 30 entries
        chrome.storage.local.set({ history: history.slice(0, 30) });
    });
}

function renderHistory() {
    chrome.storage.local.get(["history"], (res) => {
        const list    = document.getElementById("historyList");
        const history = res.history || [];

        if (history.length === 0) {
            list.innerHTML = `<p class="empty-history">No history yet. Extract and process a conversation to save it here.</p>`;
            return;
        }

        list.innerHTML = "";
        history.forEach(entry => {
            const card = document.createElement("button");
            card.className = "history-card";
            card.innerHTML = `
                <span class="history-card-title">${escapeHTML(entry.title)}</span>
                <span class="history-card-meta">${formatDate(entry.timestamp)}</span>`;
            card.addEventListener("click", () => {
                showHistoryEntry(entry);
            });
            list.appendChild(card);
        });
    });
}

function showHistoryEntry(entry) {
    showView("main");
    showResult(entry.data);
    setStatus(`Loaded: ${entry.title}`, "success");
}

function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── View switching ────────────────────────────────────────────

function showView(name) {
    document.getElementById("mainView").classList.toggle("hidden", name !== "main");
    document.getElementById("historyView").classList.toggle("hidden", name !== "history");
}

document.getElementById("historyBtn").addEventListener("click", () => {
    showView("history");
    renderHistory();
});

document.getElementById("backBtn").addEventListener("click", () => showView("main"));

document.getElementById("clearHistory").addEventListener("click", () => {
    chrome.storage.local.set({ history: [] }, () => renderHistory());
});

// ── Save API key ──────────────────────────────────────────────

document.getElementById("saveKey").addEventListener("click", () => {
    const key = document.getElementById("apiKey").value.trim();
    if (!key) { setStatus("Paste your Gemini API key first.", "error"); return; }

    chrome.runtime.sendMessage({ action: "saveKey", key: "GOOGLE_API_KEY", value: key }, () => {
        document.getElementById("apiKey").value = "";
        document.getElementById("keySaved").classList.remove("hidden");
        setStatus("API key saved.", "success");
        setTimeout(() => document.getElementById("keySaved").classList.add("hidden"), 3000);
    });
});

// ── Step 1: Extract ───────────────────────────────────────────

document.getElementById("extract").addEventListener("click", async () => {
    clearStatus();
    document.getElementById("resultArea").classList.add("hidden");
    document.getElementById("process").disabled = true;
    extractedData = null;
    currentResult = null;

    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    chrome.tabs.sendMessage(tab.id, { action: "extract" }, (res) => {
        if (chrome.runtime.lastError) {
            setStatus("Connection failed — refresh the page and try again.", "error");
            return;
        }
        if (!res || !res.messages || res.messages.length === 0) {
            setStatus("No messages found on this page.", "error");
            return;
        }

        extractedData = res;
        document.getElementById("process").disabled = false;
        setStatus(`Extracted ${res.messages.length} message(s). Click ② Process to compress.`, "success");
    });
});

// ── Step 2: Process ───────────────────────────────────────────

document.getElementById("process").addEventListener("click", () => {
    if (!extractedData) { setStatus("Extract first.", "error"); return; }

    document.getElementById("process").disabled = true;
    document.getElementById("extract").disabled = true;
    setStatus("⏳ Processing… this may take 10–30 seconds.", "info");

    chrome.runtime.sendMessage(
        { action: "process", messages: extractedData.messages },
        (res) => {
            document.getElementById("extract").disabled = false;
            document.getElementById("process").disabled = false;

            if (chrome.runtime.lastError) {
                setStatus("Background error: " + chrome.runtime.lastError.message, "error");
                return;
            }
            if (!res || !res.ok) {
                setStatus("Error: " + (res?.error ?? "Unknown error"), "error");
                return;
            }
            //console.log("Ment0x RESULT DATA for res:", res);
            showResult(res.data);
            //console.log("Ment0x RESULT DATA for res Data:", res.data);
            setStatus("✓ Done.", "success");

            // Save to history
            saveToHistory(res.data, {
                title: extractedData.title || document.title || "Conversation",
                url:   extractedData.url   || "",
            });
        }
    );
});