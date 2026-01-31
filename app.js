// History Manager for storing and retrieving markdown documents
class HistoryManager {
  constructor(maxItems = 100) {
    this.maxItems = maxItems;
    this.storageKey = 'markdown-history';
  }

  getHistory() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  saveHistory(history) {
    localStorage.setItem(this.storageKey, JSON.stringify(history));
  }

  addEntry(content) {
    if (!content || !content.trim()) return;
    
    const history = this.getHistory();
    const preview = this.generatePreview(content);
    const title = this.extractTitle(content);
    
    // Check if identical to most recent entry
    if (history.length > 0 && history[0].content === content) {
      return;
    }
    
    const entry = {
      id: Date.now().toString(),
      content,
      preview,
      title,
      timestamp: new Date().toISOString()
    };
    
    history.unshift(entry);
    
    // Keep only max items
    if (history.length > this.maxItems) {
      history.length = this.maxItems;
    }
    
    this.saveHistory(history);
    return entry;
  }

  generatePreview(content) {
    const lines = content.split('\n');
    const firstNonEmpty = lines.find(line => line.trim().length > 0);
    if (!firstNonEmpty) return 'Empty document';
    
    const clean = firstNonEmpty
      .replace(/[#*`_~]/g, '')
      .trim()
      .slice(0, 80);
    
    return clean.length < firstNonEmpty.length ? clean + '...' : clean;
  }

  extractTitle(content) {
    const lines = content.split('\n');
    const heading = lines.find(line => line.startsWith('#'));
    if (heading) {
      return heading.replace(/^#+\s*/, '').trim().slice(0, 50);
    }
    const firstLine = lines.find(line => line.trim().length > 0);
    if (firstLine) {
      return firstLine.replace(/[#*`_~]/g, '').trim().slice(0, 50);
    }
    return 'Untitled';
  }

  getEntry(id) {
    const history = this.getHistory();
    return history.find(entry => entry.id === id);
  }

  deleteEntry(id) {
    const history = this.getHistory().filter(entry => entry.id !== id);
    this.saveHistory(history);
  }

  clearHistory() {
    localStorage.removeItem(this.storageKey);
  }

  formatDate(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours === 0) {
        const minutes = Math.floor(diff / (1000 * 60));
        return minutes < 1 ? 'Just now' : `${minutes}m ago`;
      }
      return `${hours}h ago`;
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return `${days} days ago`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }
}

// Toast Notification System
class Toast {
  constructor() {
    this.container = document.getElementById('toast-container');
    this.toasts = [];
  }

  show(message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const iconMap = {
      success: 'ph-check-circle',
      error: 'ph-warning-circle',
      info: 'ph-info'
    };
    
    toast.innerHTML = `
      <i class="ph-fill ${iconMap[type]}"></i>
      <span>${this.escapeHtml(message)}</span>
      <button class="toast-close" aria-label="Close notification">
        <i class="ph ph-x"></i>
      </button>
    `;
    
    this.container.appendChild(toast);
    this.toasts.push(toast);
    
    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });
    
    // Auto dismiss
    const timeoutId = setTimeout(() => {
      this.dismiss(toast);
    }, duration);
    
    // Close button
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
      clearTimeout(timeoutId);
      this.dismiss(toast);
    });
    
    // Pause on hover
    toast.addEventListener('mouseenter', () => {
      clearTimeout(timeoutId);
    });
    
    toast.addEventListener('mouseleave', () => {
      const newTimeoutId = setTimeout(() => {
        this.dismiss(toast);
      }, duration);
      // Store new timeout on toast element for cleanup
      toast.dataset.timeoutId = newTimeoutId;
    });
    
    // Limit max toasts
    if (this.toasts.length > 3) {
      this.dismiss(this.toasts[0]);
    }
    
    return toast;
  }

  dismiss(toast) {
    toast.classList.remove('show');
    
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
      this.toasts = this.toasts.filter(t => t !== toast);
    }, 300);
  }

  success(message, duration) {
    return this.show(message, 'success', duration);
  }

  error(message, duration) {
    return this.show(message, 'error', duration);
  }

  info(message, duration) {
    return this.show(message, 'info', duration);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

class MarkdownToPDF {
  constructor() {
    this.md = window.markdownit({
      html: true,
      linkify: true,
      typographer: true,
    });

    // Add math support if plugins are available
    const texmathPlugin = window.texmath || window.markdownitTexmath;
    if (texmathPlugin && window.katex) {
      this.md.use(texmathPlugin, {
        engine: window.katex,
        delims: 'dollars',
        katexOptions: { throwOnError: false },
      });
    }

    this.debounceTimer = null;
    this.isResizing = false;
    this.mermaidCounter = 0;
    this.historyManager = new HistoryManager(100);
    this.historySaveTimer = null;
    this.toast = new Toast();
    this.currentPanel = 'editor'; // For mobile: 'editor' or 'preview'
    this.scrollSyncEnabled = localStorage.getItem('scroll-sync-enabled') !== 'false';
    this.compactMode = localStorage.getItem('pdf-compact-mode') === 'true';
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
    const historyBtn = document.getElementById('history-btn');
    const resizer = document.getElementById('resizer');

    mdInput.addEventListener('input', () => {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.renderMarkdown(), 250);
      localStorage.setItem('markdown-content', mdInput.value);
      
      // Update document statistics
      this.updateDocumentStats(mdInput.value);
      
      // Auto-save to history after 5 seconds of inactivity
      clearTimeout(this.historySaveTimer);
      this.historySaveTimer = setTimeout(() => {
        if (mdInput.value.trim().length > 50) {
          this.historyManager.addEntry(mdInput.value);
        }
      }, 5000);
    });

    historyBtn?.addEventListener('click', () => this.toggleHistoryPanel());

    // History panel controls
    const closeHistoryBtn = document.getElementById('close-history-btn');
    const clearHistoryBtn = document.getElementById('clear-history-btn');
    const historyOverlay = document.getElementById('history-overlay');

    closeHistoryBtn?.addEventListener('click', () => this.closeHistoryPanel());
    clearHistoryBtn?.addEventListener('click', () => this.clearAllHistory());
    historyOverlay?.addEventListener('click', () => this.closeHistoryPanel());

    // Keyboard shortcut: Ctrl+H to toggle history
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault();
        this.toggleHistoryPanel();
      }
      if (e.key === 'Escape') {
        this.closeHistoryPanel();
      }
    });

    generateBtn.addEventListener('click', () => this.generatePDF());
    focusModeBtn.addEventListener('click', () => this.toggleFocusMode());
    themeSwitcherBtn.addEventListener('click', () => this.switchTheme());
    
    // Compact mode toggle
    const compactModeBtn = document.getElementById('compact-mode-btn');
    compactModeBtn?.addEventListener('click', () => this.toggleCompactMode());
    this.updateCompactModeUI();
    
    // Scroll sync toggle
    const scrollSyncBtn = document.getElementById('scroll-sync-btn');
    scrollSyncBtn?.addEventListener('click', () => this.toggleScrollSync());
    this.updateScrollSyncUI();
    
    // Initialize scroll sync
    this.initScrollSync();

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
          this.toast.success(`File loaded: ${file.name}`);
        };
        reader.readAsText(file);
      } else if (file) {
        this.toast.error('Please drop a text or markdown file');
      }
    });

    // Mobile touch gestures for panel switching
    this.initMobileGestures();
  }

  initMobileGestures() {
    // Only enable on touch devices
    if (!window.matchMedia('(pointer: coarse)').matches) return;

    const mainContent = document.querySelector('.main-content');
    const panelIndicator = document.getElementById('panel-indicator');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    
    // Show panel indicator and menu button on mobile
    if (panelIndicator) {
      panelIndicator.style.display = 'flex';
    }
    if (mobileMenuBtn) {
      mobileMenuBtn.style.display = 'flex';
    }

    let touchStartX = 0;
    let touchEndX = 0;
    const minSwipeDistance = 50;

    mainContent.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    mainContent.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      this.handleSwipe(touchEndX - touchStartX, minSwipeDistance);
    }, { passive: true });

    // Panel indicator clicks
    panelIndicator?.querySelectorAll('.panel-dot').forEach((dot) => {
      dot.addEventListener('click', () => {
        const panel = dot.dataset.panel;
        this.switchMobilePanel(panel);
      });
    });

    // Mobile menu button
    mobileMenuBtn?.addEventListener('click', () => {
      this.openMobileSheet();
    });

    // Initialize mobile sheet
    this.initMobileSheet();
  }

  initMobileSheet() {
    const mobileSheet = document.getElementById('mobile-sheet');
    const mobileSheetOverlay = document.getElementById('mobile-sheet-overlay');
    const cancelBtn = mobileSheet?.querySelector('.mobile-sheet-cancel');

    // Sheet actions
    mobileSheet?.querySelectorAll('.mobile-sheet-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        this.handleMobileSheetAction(action);
        this.closeMobileSheet();
      });
    });

    // Cancel button
    cancelBtn?.addEventListener('click', () => {
      this.closeMobileSheet();
    });

    // Overlay click
    mobileSheetOverlay?.addEventListener('click', () => {
      this.closeMobileSheet();
    });
  }

  openMobileSheet() {
    const mobileSheet = document.getElementById('mobile-sheet');
    const mobileSheetOverlay = document.getElementById('mobile-sheet-overlay');
    
    // Update sync button state
    const syncBtn = mobileSheet?.querySelector('[data-action="sync"]');
    if (syncBtn) {
      const icon = syncBtn.querySelector('i');
      if (this.scrollSyncEnabled) {
        icon.className = 'ph-fill ph-link';
        syncBtn.style.opacity = '1';
      } else {
        icon.className = 'ph ph-link';
        syncBtn.style.opacity = '0.6';
      }
    }

    mobileSheet?.classList.add('open');
    mobileSheetOverlay?.classList.add('visible');
  }

  closeMobileSheet() {
    const mobileSheet = document.getElementById('mobile-sheet');
    const mobileSheetOverlay = document.getElementById('mobile-sheet-overlay');
    
    mobileSheet?.classList.remove('open');
    mobileSheetOverlay?.classList.remove('visible');
  }

  handleMobileSheetAction(action) {
    switch (action) {
      case 'export':
        this.generatePDF();
        break;
      case 'history':
        this.openHistoryPanel();
        break;
      case 'theme':
        this.switchTheme();
        break;
      case 'focus':
        this.toggleFocusMode();
        break;
      case 'sync':
        this.toggleScrollSync();
        break;
    }
  }

  toggleCompactMode() {
    this.compactMode = !this.compactMode;
    localStorage.setItem('pdf-compact-mode', this.compactMode);
    this.updateCompactModeUI();
    
    const status = this.compactMode ? 'enabled' : 'disabled';
    this.toast.info(`Compact PDF mode ${status}`);
  }

  updateCompactModeUI() {
    const compactModeBtn = document.getElementById('compact-mode-btn');
    if (compactModeBtn) {
      const icon = compactModeBtn.querySelector('i');
      if (this.compactMode) {
        icon.className = 'ph-fill ph-text-t';
        compactModeBtn.style.background = 'var(--accent-gradient)';
        compactModeBtn.style.color = '#ffffff';
        compactModeBtn.style.borderColor = 'transparent';
      } else {
        icon.className = 'ph ph-text-t';
        compactModeBtn.style.background = '';
        compactModeBtn.style.color = '';
        compactModeBtn.style.borderColor = '';
      }
    }
  }

  toggleScrollSync() {
    this.scrollSyncEnabled = !this.scrollSyncEnabled;
    localStorage.setItem('scroll-sync-enabled', this.scrollSyncEnabled);
    this.updateScrollSyncUI();
    
    const status = this.scrollSyncEnabled ? 'enabled' : 'disabled';
    this.toast.info(`Scroll sync ${status}`);
  }

  updateScrollSyncUI() {
    const scrollSyncBtn = document.getElementById('scroll-sync-btn');
    if (scrollSyncBtn) {
      const icon = scrollSyncBtn.querySelector('i');
      if (this.scrollSyncEnabled) {
        icon.className = 'ph-fill ph-link';
        scrollSyncBtn.style.opacity = '1';
      } else {
        icon.className = 'ph ph-link';
        scrollSyncBtn.style.opacity = '0.5';
      }
    }
  }

  initScrollSync() {
    const mdInput = document.getElementById('md-input');
    const previewPanel = document.getElementById('preview-panel');
    
    if (!mdInput || !previewPanel) return;
    
    let isScrolling = false;
    let scrollTimeout;
    
    // Map editor lines to preview elements
    const getLineMap = () => {
      const lines = mdInput.value.split('\n');
      const map = [];
      let lineNumber = 0;
      
      previewPanel.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, pre').forEach((el, index) => {
        // Find corresponding line in editor based on element type
        for (let i = lineNumber; i < lines.length; i++) {
          const line = lines[i];
          if ((el.tagName.match(/^H[1-6]$/) && line.startsWith('#')) ||
              (el.tagName === 'P' && line.trim() && !line.startsWith('#') && !line.startsWith('```') && !line.startsWith('-') && !line.startsWith('*')) ||
              (el.tagName === 'LI' && (line.trim().startsWith('-') || line.trim().startsWith('*'))) ||
              (el.tagName === 'PRE' && line.startsWith('```'))) {
            map.push({ element: el, line: i });
            lineNumber = i + 1;
            break;
          }
        }
      });
      
      return map;
    };
    
    // Calculate editor scroll percentage and map to preview
    const syncEditorToPreview = () => {
      if (!this.scrollSyncEnabled || isScrolling) return;
      
      isScrolling = true;
      clearTimeout(scrollTimeout);
      
      const editorScrollPercent = mdInput.scrollTop / (mdInput.scrollHeight - mdInput.clientHeight);
      const previewScrollTarget = editorScrollPercent * (previewPanel.scrollHeight - previewPanel.clientHeight);
      
      previewPanel.scrollTop = previewScrollTarget;
      
      scrollTimeout = setTimeout(() => {
        isScrolling = false;
      }, 100);
    };
    
    // Debounced scroll handler
    let debounceTimer;
    mdInput.addEventListener('scroll', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(syncEditorToPreview, 50);
    }, { passive: true });
    
    // Also sync on input/render
    const originalRenderMarkdown = this.renderMarkdown.bind(this);
    this.renderMarkdown = async () => {
      await originalRenderMarkdown();
      if (this.scrollSyncEnabled) {
        setTimeout(syncEditorToPreview, 100);
      }
    };
  }

  handleSwipe(deltaX, threshold) {
    // Left swipe (negative delta) shows preview
    // Right swipe (positive delta) shows editor
    if (Math.abs(deltaX) > threshold) {
      if (deltaX < 0 && this.currentPanel === 'editor') {
        this.switchMobilePanel('preview');
      } else if (deltaX > 0 && this.currentPanel === 'preview') {
        this.switchMobilePanel('editor');
      }
    }
  }

  switchMobilePanel(panel) {
    if (this.currentPanel === panel) return;

    const editorPanel = document.getElementById('editor-panel');
    const previewPanel = document.getElementById('preview-panel');
    const resizer = document.getElementById('resizer');
    const dots = document.querySelectorAll('.panel-dot');

    if (panel === 'editor') {
      editorPanel.style.display = 'flex';
      previewPanel.style.display = 'none';
      resizer.style.display = 'none';
      dots[0].classList.add('active');
      dots[1].classList.remove('active');
    } else {
      editorPanel.style.display = 'none';
      previewPanel.style.display = 'flex';
      resizer.style.display = 'none';
      dots[0].classList.remove('active');
      dots[1].classList.add('active');
      // Re-render preview to ensure it's up to date
      this.renderMarkdown();
    }

    this.currentPanel = panel;
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
        this.toast.error('Please add some markdown content before generating PDF.');
        return;
      }

      // Save to history before generating PDF
      const mdInput = document.getElementById('md-input');
      this.historyManager.addEntry(mdInput.value);

      // Prepare content for PDF
      const preparedElement = await this.prepareContentForPDF(preview);

      // Generate PDF using Worker API for large documents
      await this.generatePDFWithWorkerAPI(preparedElement);
    } catch (error) {
      console.error('PDF generation error:', error);
      this.toast.error(`PDF generation failed: ${error?.message || 'Unknown error'}`);
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
      // Skip KaTeX elements to preserve their internal styling
      if (el.closest('.katex')) return;

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
      .querySelectorAll('p, blockquote, pre, ul, ol, table, .katex-display')
      .forEach((el) => {
        el.style.pageBreakInside = 'avoid';
        el.style.breakInside = 'avoid';
      });
  }

  async generatePDFWithWorkerAPI(element) {
    const filename = this.getDynamicFilename();
    // Adjust margins based on compact mode
    const margin = this.compactMode ? 10 : 15;
    
    const options = {
      margin: margin,
      filename: filename,
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

    // Apply compact mode styles to element if enabled
    if (this.compactMode) {
      element.style.fontSize = '13px';
      element.style.lineHeight = '1.5';
      element.querySelectorAll('p, li').forEach(el => {
        el.style.marginBottom = '0.5em';
      });
      element.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(el => {
        el.style.marginTop = '1em';
        el.style.marginBottom = '0.5em';
      });
    }

    // Use the simple, working approach
    await html2pdf().set(options).from(element).save();
    
    // Show success toast
    this.toast.success(`PDF exported: ${filename}`);
  }

  getDynamicFilename() {
    const input = document.getElementById('md-input').value.trim();
    if (!input) return 'markdown-export.pdf';

    const lines = input.split('\n');
    const firstLine = lines.find((line) => line.trim().length > 0);
    if (!firstLine) return 'markdown-export.pdf';

    let title = firstLine
      .replace(/[#*`_~]/g, '')
      .trim();

    if (!title) return 'markdown-export.pdf';

    const words = title.split(/\s+/);
    const limitedWords = words.slice(0, 5);
    const kebabName = limitedWords
      .join('-')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '');

    return kebabName ? `${kebabName}.pdf` : 'markdown-export.pdf';
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

-   **Bulletproof Layout:** Editor and preview panes scroll independently. No more page scroll or overflow.
-   **History:** Access previously pasted Markdown content, even days later.
-   **Catppuccin Theme:** Light (Latte) and Dark (Mocha) modes are preserved.
-   **Resizable Panels:** Adjust the editor and preview panes.
-   **Focus Mode:** Hide the preview for distraction-free writing.
-   **Math Support:** Render LaTeX formulas with KaTeX.

## Math Example

The quadratic formula:
$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$

Inline math: $E = mc^2$
`;
    const mdInput = document.getElementById('md-input');
    if (!localStorage.getItem('markdown-content')) {
      mdInput.value = sample;
    } else {
      mdInput.value = localStorage.getItem('markdown-content');
    }
  }

  toggleHistoryPanel() {
    const panel = document.getElementById('history-panel');
    const overlay = document.getElementById('history-overlay');
    const isOpen = panel.classList.contains('open');
    
    if (isOpen) {
      this.closeHistoryPanel();
    } else {
      this.openHistoryPanel();
    }
  }

  openHistoryPanel() {
    const panel = document.getElementById('history-panel');
    const overlay = document.getElementById('history-overlay');
    
    this.renderHistoryList();
    panel.classList.add('open');
    overlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }

  closeHistoryPanel() {
    const panel = document.getElementById('history-panel');
    const overlay = document.getElementById('history-overlay');
    
    panel.classList.remove('open');
    overlay.classList.remove('visible');
    document.body.style.overflow = '';
  }

  renderHistoryList() {
    const list = document.getElementById('history-list');
    const history = this.historyManager.getHistory();
    
    if (history.length === 0) {
      list.innerHTML = `
        <div class="history-empty">
          <i class="ph ph-clock-counter-clockwise"></i>
          <p>No history yet</p>
          <span>Your markdown documents will appear here</span>
        </div>
      `;
      return;
    }
    
    list.innerHTML = history.map(entry => `
      <div class="history-item" data-id="${entry.id}">
        <div class="history-item-content">
          <div class="history-item-title">${this.escapeHtml(entry.title)}</div>
          <div class="history-item-preview">${this.escapeHtml(entry.preview)}</div>
          <div class="history-item-meta">
            <span class="history-item-date">
              <i class="ph ph-calendar"></i>
              ${this.historyManager.formatDate(entry.timestamp)}
            </span>
          </div>
        </div>
        <div class="history-item-actions">
          <button class="history-action-btn load" title="Load into editor" data-action="load">
            <i class="ph ph-arrow-u-up-left"></i>
          </button>
          <button class="history-action-btn delete" title="Delete" data-action="delete">
            <i class="ph ph-trash"></i>
          </button>
        </div>
      </div>
    `).join('');
    
    // Bind item actions
    list.querySelectorAll('.history-item').forEach(item => {
      const id = item.dataset.id;
      
      item.querySelector('[data-action="load"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.loadHistoryEntry(id);
      });
      
      item.querySelector('[data-action="delete"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteHistoryEntry(id);
      });
      
      item.addEventListener('click', () => this.loadHistoryEntry(id));
    });
  }

  loadHistoryEntry(id) {
    const entry = this.historyManager.getEntry(id);
    if (!entry) return;
    
    const mdInput = document.getElementById('md-input');
    mdInput.value = entry.content;
    localStorage.setItem('markdown-content', entry.content);
    this.renderMarkdown();
    this.closeHistoryPanel();
    this.toast.success('Document loaded from history');
  }

  deleteHistoryEntry(id) {
    this.historyManager.deleteEntry(id);
    this.renderHistoryList();
    this.toast.info('Entry removed from history');
  }

  clearAllHistory() {
    if (confirm('Are you sure you want to clear all history? This cannot be undone.')) {
      this.historyManager.clearHistory();
      this.renderHistoryList();
      this.toast.info('History cleared');
    }
  }

  updateDocumentStats(content) {
    const statsEl = document.getElementById('doc-stats');
    const statsContent = document.getElementById('stats-content');
    
    if (!content || content.trim().length === 0) {
      statsEl.classList.remove('visible');
      return;
    }
    
    // Calculate word count (split by whitespace)
    const words = content.trim().split(/\s+/).filter(word => word.length > 0).length;
    
    // Estimate reading time (200 words per minute)
    const readingTime = Math.max(1, Math.ceil(words / 200));
    
    // Estimate PDF pages (rough estimate: ~500 words per A4 page)
    const pages = Math.max(1, Math.ceil(words / 500));
    
    // Format numbers with commas
    const formatNumber = (num) => num.toLocaleString();
    
    statsContent.textContent = `${formatNumber(words)} words · ${pages} page${pages > 1 ? 's' : ''} · ${readingTime} min`;
    statsEl.classList.add('visible');
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

document.addEventListener('DOMContentLoaded', () => new MarkdownToPDF());
