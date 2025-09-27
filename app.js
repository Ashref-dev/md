class MarkdownToPDF {
    constructor() {
        this.md = window.markdownit({ html: true, linkify: true, typographer: true });
        this.debounceTimer = null;
        this.isResizing = false;
        this.init();
    }

    init() {
        mermaid.initialize({ startOnLoad: false, theme: 'default' });
        this.loadTheme();
        this.bindEvents();
        this.loadSampleMarkdown();
        this.renderMarkdown();
    }

    bindEvents() {
        const mdInput = document.getElementById('md-input');
        const generateBtn = document.getElementById('generate-btn');
        const focusModeBtn = document.getElementById('focus-mode-btn');
        const themeSwitcherBtn = document.getElementById('theme-switcher-btn');
        const resizer = document.getElementById('resizer');
        const hamburgerBtn = document.getElementById('hamburger-btn');
        const menuContainer = document.getElementById('menu-container');

        mdInput.addEventListener('input', () => {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => this.renderMarkdown(), 250);
            localStorage.setItem('markdown-content', mdInput.value);
        });

        generateBtn.addEventListener('click', () => this.generatePDF());
        focusModeBtn.addEventListener('click', () => this.toggleFocusMode());
        themeSwitcherBtn.addEventListener('click', () => this.switchTheme());

        hamburgerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            menuContainer.classList.toggle('menu-open');
        });
        
        document.addEventListener('click', (e) => {
            if (!menuContainer.contains(e.target)) {
                menuContainer.classList.remove('menu-open');
            }
        });

        resizer.addEventListener('mousedown', (e) => {
            const startX = e.clientX;
            const editorPanel = document.getElementById('editor-panel');
            const startWidth = editorPanel.offsetWidth;

            const doDrag = (e) => {
                const newWidth = startWidth + e.clientX - startX;
                editorPanel.style.flexBasis = `${newWidth}px`;
            };

            const stopDrag = () => {
                document.removeEventListener('mousemove', doDrag);
                document.removeEventListener('mouseup', stopDrag);
            };

            document.addEventListener('mousemove', doDrag);
            document.addEventListener('mouseup', stopDrag);
        });

        const appContainer = document.querySelector('.app-container');
        appContainer.addEventListener('dragover', e => e.preventDefault());
        appContainer.addEventListener('drop', e => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('text/')) {
                const reader = new FileReader();
                reader.onload = event => {
                    mdInput.value = event.target.result;
                    this.renderMarkdown();
                };
                reader.readAsText(file);
            }
        });
    }

    toggleFocusMode() {
        document.body.classList.toggle('focus-mode');
        const previewPanel = document.getElementById('preview-panel');
        const resizer = document.getElementById('resizer');
        const isFocused = document.body.classList.contains('focus-mode');
        
        previewPanel.style.display = isFocused ? 'none' : 'flex';
        resizer.style.display = isFocused ? 'none' : 'flex';
    }

    switchTheme() {
        const isDark = document.body.classList.toggle('dark-theme');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    }

    loadTheme() {
        const theme = localStorage.getItem('theme');
        if (theme === 'dark') {
            document.body.classList.add('dark-theme');
        }
    }

    async renderMarkdown() {
        const input = document.getElementById('md-input').value;
        const preview = document.getElementById('preview');
        preview.innerHTML = this.md.render(input);
        
        // Expand all spoilers
        preview.querySelectorAll('details').forEach(details => {
            details.open = true;
        });

        preview.querySelectorAll('pre > code.language-mermaid').forEach(async (codeEl) => {
            const pre = codeEl.closest('pre');
            const container = document.createElement('div');
            container.className = 'diagram';
            const mermaidCode = codeEl.textContent.trim();
            
            try {
                const { svg } = await mermaid.render(`mermaid-${Date.now()}`, mermaidCode);
                container.innerHTML = svg;
                pre.parentNode.replaceChild(container, pre);
            } catch (error) {
                container.innerHTML = `<pre>Mermaid Error: ${error.message}</pre>`;
                pre.parentNode.replaceChild(container, pre);
            }
        });
    }

    async generatePDF() {
        const generateBtn = document.getElementById('generate-btn');
        const btnText = generateBtn.querySelector('.btn-text');
        const btnLoading = generateBtn.querySelector('.btn-loading');
        
        generateBtn.disabled = true;
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline-block';

        await this.renderMarkdown();
        await new Promise(resolve => setTimeout(resolve, 500));

        const preview = document.getElementById('preview');
        const options = {
            margin: 15,
            filename: 'markdown-export.pdf',
            image: { type: 'png', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        try {
            await html2pdf().set(options).from(preview).save();
        } catch (error) {
            console.error('PDF generation error:', error);
        } finally {
            generateBtn.disabled = false;
            btnText.style.display = 'inline-block';
            btnLoading.style.display = 'none';
        }
    }

    loadSampleMarkdown() {
        const sample = `# Welcome to the Refined Editor

**A modern, elegant, and robust Markdown to PDF converter.**

## Key Improvements

-   🔩 **Bulletproof Layout:** Editor and preview panes scroll independently. No more page scroll or overflow.
-   🍔 **Elegant Navigation:** A clean, collapsible hamburger menu in the top-left.
-   🎨 **Catppuccin Theme:** Light (Latte) and Dark (Mocha) modes are preserved.
-   ↔️ **Resizable Panels:** Adjust the editor and preview panes.
-   🧘 **Focus Mode:** Hide the preview for distraction-free writing.

## Mermaid Diagram

\
\
mermaid
graph TD
    A[Start] --> B{Is the UI clean?};
    B -->|Yes| C[Generate PDF];
    B -->|No| D[Refine CSS!];
    D --> B;
    C --> E[Done!];
\
\

`;
        const mdInput = document.getElementById('md-input');
        if (!localStorage.getItem('markdown-content')) {
            mdInput.value = sample;
        } else {
            mdInput.value = localStorage.getItem('markdown-content');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => new MarkdownToPDF());
