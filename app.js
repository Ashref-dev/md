class MarkdownToPDF {
  constructor() {
    this.md = window.markdownit({
      html: true,
      linkify: true,
      typographer: true,
    });
    this.debounceTimer = null;
    this.isResizing = false;
    this.mermaidCounter = 0;
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

    mdInput.addEventListener('input', () => {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.renderMarkdown(), 250);
      localStorage.setItem('markdown-content', mdInput.value);
    });

    generateBtn.addEventListener('click', () => this.generatePDF());
    focusModeBtn.addEventListener('click', () => this.toggleFocusMode());
    themeSwitcherBtn.addEventListener('click', () => this.switchTheme());

    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const editorPanel = document.getElementById('editor-panel');
      const startX = e.clientX;
      const startWidth = editorPanel.getBoundingClientRect().width;

      // Freeze flex growth to avoid initial jump and use fixed pixel width
      editorPanel.style.flex = '0 0 auto';
      editorPanel.style.width = `${startWidth}px`;

      const onMouseMove = (moveEvt) => {
        const delta = moveEvt.clientX - startX;
        editorPanel.style.width = `${startWidth + delta}px`;
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    const appContainer = document.querySelector('.app-container');
    appContainer.addEventListener('dragover', (e) => e.preventDefault());
    appContainer.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('text/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
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
    const body = document.body;
    const isDark = body.classList.toggle('dark-theme');
    const themeSwitcherBtn = document.getElementById('theme-switcher-btn');
    const icon = themeSwitcherBtn.querySelector('i');

    // Update icon
    if (isDark) {
      icon.className = 'ph-fill ph-sun';
    } else {
      icon.className = 'ph-fill ph-moon';
    }

    // Save preference
    localStorage.setItem('theme', isDark ? 'dark' : 'light');

    // NOTE: We keep GitHub markdown CSS on light mode always for consistent preview/export
    // The preview panel styling in styles.css keeps it white regardless of theme
  }

  loadTheme() {
    const theme = localStorage.getItem('theme') || 'dark'; // Default to dark
    const body = document.body;
    const themeSwitcherBtn = document.getElementById('theme-switcher-btn');

    if (theme === 'dark') {
      body.classList.add('dark-theme');
      if (themeSwitcherBtn) {
        const icon = themeSwitcherBtn.querySelector('i');
        if (icon) icon.className = 'ph-fill ph-sun';
      }
    } else {
      body.classList.remove('dark-theme');
      if (themeSwitcherBtn) {
        const icon = themeSwitcherBtn.querySelector('i');
        if (icon) icon.className = 'ph-fill ph-moon';
      }
    }
    
    // Preview always uses light GitHub markdown CSS for consistency
    // This ensures preview matches PDF export exactly
  }

  async renderMarkdown() {
    const input = document.getElementById('md-input').value;
    const preview = document.getElementById('preview');

    if (!input.trim()) {
      preview.innerHTML =
        '<p style="color: #656d76; font-style: italic;">Preview will appear here...</p>';
      return;
    }

    try {
      // Render markdown into the DOM first
      preview.innerHTML = this.md.render(input);

      // Expand all spoilers
      preview.querySelectorAll('details').forEach((details) => {
        details.open = true;
      });

      // Find mermaid code blocks in the DOM to avoid HTML entity issues
      const codeBlocks = preview.querySelectorAll(
        'pre > code.language-mermaid'
      );
      const renderTasks = [];

      codeBlocks.forEach((codeEl) => {
        const pre = codeEl.closest('pre');
        const container = document.createElement('div');
        const id = `mermaid-${this.mermaidCounter++}`;
        container.className = 'diagram';
        container.id = id;

        // Read raw text (decoded), not innerHTML, so --> stays as -->, not &gt;
        const mermaidCode = codeEl.textContent.trim();

        // Replace the <pre> with our diagram container
        if (pre && pre.parentNode) pre.parentNode.replaceChild(container, pre);

        // Queue render
        const task = mermaid
          .render(`diagram-${id}`, mermaidCode)
          .then(({ svg }) => {
            container.innerHTML = svg;
            // Ensure SVG has explicit pixel dimensions for html2canvas
            const svgEl = container.querySelector('svg');
            if (svgEl) {
              // Responsive styling: let it scale to container width, preserve aspect ratio
              svgEl.removeAttribute('width');
              svgEl.removeAttribute('height');
              svgEl.style.maxWidth = '100%';
              svgEl.style.height = 'auto';
              svgEl.style.display = 'block';
              svgEl.style.margin = '16px auto';
              // Optional neutral background for better contrast in some viewers
              svgEl.style.backgroundColor = 'transparent';
            }
          })
          .catch((error) => {
            console.error('Mermaid rendering error:', error);
            container.innerHTML = `<pre style="color: #d1242f; background: #fff8f8; padding: 16px; border-radius: 6px; border-left: 4px solid #d1242f;">Mermaid Error: ${error.message}</pre>`;
          });
        renderTasks.push(task);
      });

      // Wait for all diagrams to finish (don't throw on individual failures)
      if (renderTasks.length) {
        await Promise.allSettled(renderTasks);
      }
    } catch (error) {
      console.error('Markdown rendering error:', error);
      preview.innerHTML = `<pre style="color: #d1242f;">Error rendering markdown: ${error.message}</pre>`;
    }
  }

  async generatePDF() {
    const generateBtn = document.getElementById('generate-btn');
    const btnText = generateBtn.querySelector('.btn-text');
    const btnLoading = generateBtn.querySelector('.btn-loading');
    const preview = document.getElementById('preview');

    this.showLoadingState(btnText, btnLoading, generateBtn);

    try {
      await this.wait(500);

      if (!this.validateContent(preview)) {
        alert('Please add some markdown content before generating PDF.');
        return;
      }

      // Prepare content for PDF
      const preparedElement = await this.prepareContentForPDF(preview);

      // Generate PDF using Worker API for large documents
      await this.generatePDFWithWorkerAPI(preparedElement);
    } catch (error) {
      console.error('PDF generation error:', error);
      alert(`PDF generation failed: ${error?.message || 'Unknown error'}`);
    } finally {
      this.resetLoadingState(btnText, btnLoading, generateBtn);
    }
  }

  showLoadingState(btnText, btnLoading, generateBtn) {
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline-flex';
    generateBtn.disabled = true;
  }

  resetLoadingState(btnText, btnLoading, generateBtn) {
    setTimeout(() => {
      btnText.style.display = 'inline-flex';
      btnLoading.style.display = 'none';
      generateBtn.disabled = false;
    }, 500);
  }

  validateContent(preview) {
    return (
      preview.innerHTML.trim() &&
      !preview.innerHTML.includes('Preview will appear here')
    );
  }

  async prepareContentForPDF(preview) {
    // Clone and prepare content
    const clone = preview.cloneNode(true);

    // Convert SVGs to images for PDF compatibility
    await this.convertMermaidSvgsToImages(clone);

    // Clean and optimize cloned content
    this.optimizeClonedContent(clone);

    return clone;
  }

  optimizeClonedContent(clone) {
    // Ensure proper markdown styling
    clone.className = 'markdown-body';

    // Basic styling for PDF - remove all decorative elements
    clone.style.padding = '20px';
    clone.style.backgroundColor = '#ffffff';
    clone.style.color = '#24292f';
    clone.style.fontSize = '14px';
    clone.style.lineHeight = '1.6';
    clone.style.border = 'none';
    clone.style.borderRadius = '0';
    clone.style.boxShadow = 'none';

    // Force light mode colors for all elements
    clone.querySelectorAll('*').forEach((el) => {
      // Remove any dark theme classes or inline styles that might interfere
      el.style.color = '';
      el.style.backgroundColor = '';
      el.style.borderColor = '';
    });

    // Fix tables - ensure light borders and backgrounds
    clone.querySelectorAll('table').forEach((table) => {
      table.style.borderCollapse = 'collapse';
      table.style.backgroundColor = '#ffffff';
      table.style.color = '#24292f';
      table.style.border = '1px solid #d0d7de';
    });

    clone.querySelectorAll('th, td').forEach((cell) => {
      cell.style.border = '1px solid #d0d7de';
      cell.style.padding = '8px 13px';
      cell.style.color = '#24292f';
      cell.style.backgroundColor = '#ffffff';
    });

    clone.querySelectorAll('th').forEach((th) => {
      th.style.backgroundColor = '#f6f8fa';
      th.style.fontWeight = '600';
    });

    clone.querySelectorAll('tr:nth-child(2n)').forEach((row) => {
      row.style.backgroundColor = '#f6f8fa';
    });

    // Fix horizontal rules
    clone.querySelectorAll('hr').forEach((hr) => {
      hr.style.backgroundColor = '#d0d7de';
      hr.style.border = 'none';
      hr.style.height = '1px';
      hr.style.margin = '24px 0';
    });

    // Fix headings
    clone.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading) => {
      heading.style.color = '#24292f';
      heading.style.borderBottom = heading.tagName === 'H1' || heading.tagName === 'H2' 
        ? '1px solid #d0d7de' 
        : 'none';
    });

    // Fix code blocks
    clone.querySelectorAll('pre').forEach((pre) => {
      pre.style.backgroundColor = '#f6f8fa';
      pre.style.border = '1px solid #d0d7de';
      pre.style.borderRadius = '6px';
      pre.style.padding = '16px';
    });

    clone.querySelectorAll('code').forEach((code) => {
      if (!code.parentElement || code.parentElement.tagName !== 'PRE') {
        // Inline code
        code.style.backgroundColor = '#f6f8fa';
        code.style.color = '#24292f';
        code.style.padding = '0.2em 0.4em';
        code.style.borderRadius = '6px';
      } else {
        // Code in pre blocks
        code.style.color = '#24292f';
      }
    });

    // Fix blockquotes
    clone.querySelectorAll('blockquote').forEach((bq) => {
      bq.style.borderLeft = '4px solid #d0d7de';
      bq.style.color = '#57606a';
      bq.style.paddingLeft = '16px';
      bq.style.marginLeft = '0';
    });

    // Fix links
    clone.querySelectorAll('a').forEach((a) => {
      a.style.color = '#0969da';
      a.style.textDecoration = 'none';
    });

    // Prevent headings from breaking across pages - aggressive approach
    const headings = clone.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach((heading) => {
      heading.style.pageBreakAfter = 'avoid';
      heading.style.pageBreakInside = 'avoid';
      heading.style.breakAfter = 'avoid';
      heading.style.breakInside = 'avoid';
      heading.style.marginTop = '24px';
      heading.style.marginBottom = '12px';
      heading.style.paddingTop = '8px';

      // Get next element and keep it with the heading
      const next = heading.nextElementSibling;
      if (next) {
        next.style.pageBreakBefore = 'avoid';
        next.style.breakBefore = 'avoid';
      }
    });

    // Optimize diagrams for PDF
    clone.querySelectorAll('.diagram').forEach((diagram) => {
      diagram.style.margin = '20px auto';
      diagram.style.textAlign = 'center';
      diagram.style.maxWidth = '100%';
      diagram.style.pageBreakInside = 'avoid';
      diagram.style.breakInside = 'avoid';
    });

    // Prevent other elements from breaking
    clone
      .querySelectorAll('p, blockquote, pre, ul, ol, table')
      .forEach((el) => {
        el.style.pageBreakInside = 'avoid';
        el.style.breakInside = 'avoid';
      });
  }

  async generatePDFWithWorkerAPI(element) {
    // Simple, reliable options that actually work
    const options = {
      margin: 15,
      filename: 'markdown-export.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait',
      },
    };

    // Use the simple, working approach
    await html2pdf().set(options).from(element).save();
  }

  // Small helper to pause
  wait(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  // Convert SVG diagrams to images for better PDF compatibility
  async convertMermaidSvgsToImages(container) {
    const svgs = Array.from(container.querySelectorAll('.diagram svg'));
    if (!svgs.length) return;

    const conversionPromises = svgs.map((svg) => this.convertSvgToImage(svg));
    await Promise.all(conversionPromises);
  }

  async convertSvgToImage(svg) {
    try {
      const dimensions = this.getSvgDimensions(svg);
      const dataUrl = await this.svgToImageData(svg, dimensions);

      const img = this.createOptimizedImage(dataUrl);
      this.replaceSvgWithImage(svg, img);
    } catch (error) {
      console.warn('Failed to convert SVG, keeping original:', error);
    }
  }

  getSvgDimensions(svg) {
    // Try viewBox first
    const viewBox = svg.getAttribute('viewBox');
    if (viewBox) {
      const [, , width, height] = viewBox.split(/\s+/).map(Number);
      if (width > 0 && height > 0) {
        return { width, height, scale: 1.5 };
      }
    }

    // Try explicit width/height attributes
    const width = parseFloat(
      svg.getAttribute('width')?.replace('px', '') || '0'
    );
    const height = parseFloat(
      svg.getAttribute('height')?.replace('px', '') || '0'
    );
    if (width > 0 && height > 0) {
      return { width, height, scale: 1.5 };
    }

    // Fallback to computed size
    const rect = svg.getBoundingClientRect();
    return {
      width: rect.width || 600,
      height: rect.height || 400,
      scale: 1.5,
    };
  }

  createOptimizedImage(dataUrl) {
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = 'Diagram';

    Object.assign(img.style, {
      display: 'block',
      margin: '16px auto',
      maxWidth: '100%',
      height: 'auto',
      maxHeight: '800px', // Prevent oversized images
    });

    return img;
  }

  replaceSvgWithImage(svg, img) {
    const parent = svg.parentNode;
    if (parent) {
      parent.replaceChild(img, svg);
    }
  }

  async svgToImageData(svgElement, { width, height, scale = 1 }) {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));

      // Serialize SVG with proper namespace
      let svgData = new XMLSerializer().serializeToString(svgElement);
      if (!svgData.includes('xmlns')) {
        svgData = svgData.replace(
          '<svg',
          '<svg xmlns="http://www.w3.org/2000/svg"'
        );
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        try {
          // White background for PDF clarity
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/png', 0.95));
        } catch (err) {
          console.warn('Canvas conversion failed:', err);
          resolve(
            `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgData)}`
          );
        }
      };

      img.onerror = () => reject(new Error('SVG image load failed'));
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
        svgData
      )}`;
    });
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
