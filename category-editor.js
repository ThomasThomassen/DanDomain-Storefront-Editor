// WYSIWYG Editor for Category Content using Quill.js
class CategoryEditor {
  constructor() {
    this.isActive = false;
    this.platformData = null;
    this.currentLanguage = null;
    this.currentLanguageId = 1; // Default to language ID 1
    this.categoryId = null;
    this.categoryData = null;
    this.originalSummary = '';
    this.originalDescription = '';
    this.originalTitle = '';
    this.originalElements = {};
    this.editors = {}; // Store Quill editor instances
    this.editorContainers = {}; // Store editor container elements
  }

  // Set platform data from content script
  setPlatformData(data) {
    this.platformData = data;
  }

  // Initialize the editor on category pages
  async initialize() {
    console.info('CategoryEditor: Initializing...');
    
    // Wait for platform data to be available
    if (!this.platformData && window.ddPlatformData) {
      this.platformData = window.ddPlatformData;
      console.log('CategoryEditor: Using global platform data');
    }
    
    if (!this.platformData) {
      console.warn('CategoryEditor: No platform data available, retrying...');
      setTimeout(() => this.initialize(), 500);
      return;
    }

    // Check if we're on a category page and API is configured
    if (!this.platformData.isCategoryPage && this.platformData.pageType !== 'category') {
      return;
    }

    // Initialize API
    await danDomainAPI.initialize(this.platformData.shopId);
    
    // Validate shop and domain configuration
    const validation = await danDomainAPI.validateShopAndDomain(this.platformData.shopId);
    if (!validation.isValid) {
      console.log('CategoryEditor: Shop/domain validation failed:', validation.error);
      return;
    }

    this.categoryId = this.platformData.categoryId || this.platformData.pageId;
    this.currentLanguage = this.platformData.languageIso;
    // Use detected language ID from domain validation, fallback to platform data or 1
    this.currentLanguageId = validation.languageId || this.platformData.languageId || 1;
    this.siteId = validation.siteId;
    this.detectedDomain = validation.domainInfo;

    if (!this.categoryId) {
      console.warn('CategoryEditor: Could not determine category ID', {
        categoryId: this.categoryId,
        language: this.currentLanguage,
        platformData: this.platformData,
        detectedDomain: this.detectedDomain
      });
      return;
    }

    console.info('CategoryEditor: Language settings:', {
      currentLanguage: this.currentLanguage,
      currentLanguageId: this.currentLanguageId,
      detectedFromDomain: this.detectedDomain,
      siteId: this.siteId
    });
    
    await this.loadCategoryData();
    this.detectCategoryContent();
  }

  // Load category data from API
  async loadCategoryData() {
    try {

      this.categoryData = await danDomainAPI.getCategoryDetails(this.categoryId, this.currentLanguageId, this.platformData.shopId);
      
      if (this.categoryData && this.categoryData.translations && this.categoryData.translations[0].data) {
        const translation = this.categoryData.translations[0].data;
        this.originalTitle = translation.title || '';
        this.originalSummary = translation.summary || '';
        this.originalDescription = translation.description || '';
        
        console.log('Category data loaded:', this.categoryData);
      } else {
        console.warn('No category data found for ID:', this.categoryId);
      }
    } catch (error) {
      console.error('Failed to load category data:', error);
    }
  }

  // Detect category summary and description elements on the page
  detectCategoryContent() {
    if (!this.categoryData || !this.categoryData.translations || !this.categoryData.translations[0].data) {
      console.warn('No category data available for content detection');
      return;
    }

    const translation = this.categoryData.translations[0].data;
    const summaryElement = this.findElementByContent(translation.summary, 'summary');
    const descriptionElement = this.findElementByContent(translation.description, 'description');

    if (summaryElement || descriptionElement) {
      this.setupEditor(summaryElement, descriptionElement);
    } else {
      console.warn('Could not find category content elements on page');
    }
  }

  // Find element by matching text content
  findElementByContent(htmlContent, type) {
    if (!htmlContent || htmlContent.trim() === '') {
      console.info('CategoryEditor: No content provided for element search');
      return null;
    }

    // Create a temporary element to get the text content
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    const textContent = tempDiv.textContent || tempDiv.innerText || '';
    
    if (textContent.trim() === '') {
      console.info('CategoryEditor: No text content found for element search');
      return null;
    }

    // Store the complete HTML structure from GraphQL to compare against
    const sourceHTML = tempDiv.innerHTML.trim();
    
    // Check if GraphQL response is a single wrapper element
    const isCompleteWrapper = tempDiv.children.length === 1 && 
                              tempDiv.children[0].outerHTML === sourceHTML;

    // Search for elements containing this text
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: function(node) {
          // Skip script, style, and other non-content elements
          if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK'].includes(node.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          const nodeText = node.textContent || node.innerText || '';
          // Check if this element contains our text content
          if (nodeText.includes(textContent.trim())) {
            return NodeFilter.FILTER_ACCEPT;
          }
          
          return NodeFilter.FILTER_SKIP;
        }
      }
    );

    const candidates = [];
    let node;
    while (node = walker.nextNode()) {
      const nodeText = node.textContent || node.innerText || '';
      
      // Check if this element contains our text content
      if (nodeText.includes(textContent.trim())) {
        // Skip elements that have the exact same HTML structure as the GraphQL source
        if (node.innerHTML.trim() === sourceHTML) {
          console.log('CategoryEditor: Skipping element with identical HTML structure:', node);
          return;
        }
        
        // Check if any child elements also contain the text
        const childrenWithText = Array.from(node.children).filter(child => {
          const childText = child.textContent || child.innerText || '';
          return childText.includes(textContent.trim());
        });
        
        // If no children contain the text, this is likely the innermost element
        if (childrenWithText.length === 0) {
          // Calculate similarity score - prefer exact matches
          let score;
          if (nodeText.trim() === textContent.trim()) {
            score = 100;
          } else {
            score = (textContent.trim().length / nodeText.trim().length) * 100;
          }
          
          candidates.push({ 
            element: node, 
            score,
            textLength: nodeText.trim().length,
            isLeaf: true
          });
        } else {
          // This is a parent container, give it a lower score
          const score = (textContent.trim().length / nodeText.trim().length) * 50; // Reduced score for parent elements
          candidates.push({ 
            element: node, 
            score,
            textLength: nodeText.trim().length,
            isLeaf: false
          });
        }
      }
    }

    // Sort by: 1. Prefer leaf elements, 2. Higher similarity score, 3. Shorter text length (more specific)
    candidates.sort((a, b) => {
      // First, prefer leaf elements (innermost)
      if (a.isLeaf !== b.isLeaf) {
        return b.isLeaf - a.isLeaf;
      }
      // Then by score
      if (Math.abs(a.score - b.score) > 5) {
        return b.score - a.score;
      }
      // Finally, prefer shorter text (more specific element)
      return a.textLength - b.textLength;
    });
    
    if (candidates.length > 0) {
      if (isCompleteWrapper) {
        return candidates[1].element;
      }
      return candidates[0].element;
    }

    console.info('No suitable element found for content: ', type);
    return null;
  }

  // Find element using multiple selectors
  findElement(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        return element;
      }
    }
    return null;
  }

  // Setup the editor interface with Quill
  setupEditor(summaryElement, descriptionElement) {
    // Store references to original elements
    this.summaryElement = summaryElement;
    this.descriptionElement = descriptionElement;

    // Store original content
    if (summaryElement) {
      this.originalSummary = summaryElement.innerHTML;
      this.setupQuillEditor(summaryElement, 'summary', 'Summary');
    }
    if (descriptionElement) {
      this.originalDescription = descriptionElement.innerHTML;
      this.setupQuillEditor(descriptionElement, 'description', 'Description');
    }
  }

  // Setup Quill editor for a specific element
  setupQuillEditor(element, type, displayName) {
    // Create a container for the edit button and Quill editor
    const editorContainer = this.createEditorContainer(type, displayName, element);
    
    // Insert container before the original element
    if (element.parentNode) {
      element.parentNode.insertBefore(editorContainer, element);
      // Hide the original element initially
      element.style.display = 'none';
    }
  }

  // Create a container with edit button and Quill editor
  createEditorContainer(type, displayName, originalElement) {
    const container = document.createElement('div');
    container.id = `dd-category-editor-container-${type}`;
    container.style.cssText = `
      border: 2px dashed white;
      border-radius: 10px;
      margin: 5px 0;
    `;

    // Create header with edit button
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: white;
      border-bottom: 1px solid white;
      border-radius: 6px 6px 0 0;
    `;

    const title = document.createElement('span');
    title.textContent = `${displayName} Editor`;
    title.style.cssText = `
      font-weight: bold;
      font-size: 14px;
      color: #333;
    `;

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 8px;
    `;

    // Create the edit/save button
    const editButton = this.createEditButton(type, displayName);
    buttonContainer.appendChild(editButton);

    header.appendChild(title);
    header.appendChild(buttonContainer);

    // Create Quill editor container (initially hidden)
    const quillContainer = document.createElement('div');
    quillContainer.id = `dd-quill-container-${type}`;
    quillContainer.style.cssText = `
      display: none;
    `;

    // Create preview container (shows original content when not editing)
    const previewContainer = document.createElement('div');
    previewContainer.id = `dd-preview-container-${type}`;
    this.originalElements[type] = originalElement;
    previewContainer.innerHTML = originalElement.innerHTML;
    previewContainer.className = originalElement.className;

    container.appendChild(header);
    container.appendChild(quillContainer);
    container.appendChild(previewContainer);

    // Store container reference
    this.editorContainers[type] = {
      container,
      quillContainer,
      previewContainer,
      editButton
    };

    return container;
  }

  // Create the edit button for a specific element
  createEditButton(type, displayName) {
    const button = document.createElement('button');
    button.id = `dd-category-edit-btn-${type}`;
    button.innerHTML = `Edit ${displayName}`;
    button.style.cssText = `
      background: #1a73e8;
      color: white;
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      transition: background 0.3s;
    `;

    button.addEventListener('mouseenter', () => {
      button.style.background = '#1557b0';
    });

    button.addEventListener('mouseleave', () => {
      button.style.background = button.dataset.isEditing === 'true' ? '#34a853' : '#1a73e8';
    });

    button.addEventListener('click', () => {
      this.toggleQuillEditor(type, displayName, button);
    });

    return button;
  }

  // Toggle Quill editor for a specific element
  toggleQuillEditor(type, displayName, button) {
    const isEditing = button.dataset.isEditing === 'true';
    
    if (isEditing) {
      // Save changes for this specific element
      this.saveQuillChanges(type, displayName, button);
    } else {
      // Enable editing for this element
      this.enableQuillEditor(type, displayName, button);
    }
  }

  // Enable Quill editing for a specific element
  enableQuillEditor(type, displayName, button) {
    const containers = this.editorContainers[type];
    if (!containers) return;

    button.dataset.isEditing = 'true';
    button.innerHTML = `Save ${displayName}`;
    button.style.background = '#34a853';

    // Show Quill container, hide preview
    containers.quillContainer.style.display = 'block';
    containers.previewContainer.style.display = 'none';

    // Initialize Quill editor if not already done
    if (!this.editors[type]) {
      this.initializeQuillEditor(type, containers.quillContainer, containers.container);
    }

    // Set content from original element with <br> preprocessing
    const originalContent = type === 'summary' ? this.originalSummary : this.originalDescription;
    
    if (originalContent && originalContent.trim()) {
      const processedContent = originalContent.replace(/<br\s*\/?>/gi, '\n');
      this.editors[type].clipboard.dangerouslyPasteHTML(processedContent);
    }
    
    // Clean up any empty paragraphs that might have been added
    setTimeout(() => {
      this.cleanEmptyParagraphs(this.editors[type].root);
    }, 100);

    // Focus the editor
    this.editors[type].focus();
  }

  // Initialize Quill editor instance
  initializeQuillEditor(type, container, parentcontainer) {
    const toolbarOptions = [
      ['bold', 'italic', 'underline'],
      [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      ['link'],
      ['clean']
    ];

    this.editors[type] = new Quill(container, {
      theme: 'snow',
      modules: {
        toolbar: toolbarOptions,
        history: {
          delay: 2000,
          maxStack: 500,
          userOnly: true
        }
      },
      placeholder: `Edit ${type} content...`,
      formats: ['bold', 'italic', 'underline', 'header', 'list', 'link']
    });

    // Customize Quill toolbar styling to match our design
    const toolbar = parentcontainer.querySelector('.ql-toolbar');
    if (toolbar) {
      toolbar.style.cssText = `
        border: none;
        border-bottom: 1px solid #e0e0e0;
        padding: 8px 12px;
        background: white;
      `;
      
    }

    const editor = container.querySelector('.ql-editor');
    const originalElementClasses = this.originalElements[type].classList;
    console.log(originalElementClasses);
    editor.classList.add(...originalElementClasses);
    
    // Clean up empty paragraphs that Quill adds
    this.cleanEmptyParagraphs(editor);
  }

  // Remove empty paragraphs (including those with just whitespace/nbsp)
  cleanEmptyParagraphs(container) {
    while (container.firstChild && container.firstChild.tagName === 'P') {
      const textContent = container.firstChild.textContent || container.firstChild.innerText || '';
      const cleanText = textContent.replace(/[\s\u00A0\u2000-\u200B\u2028-\u2029\u202F\u205F\u3000]/g, '');
      if (cleanText === '') {
        container.removeChild(container.firstChild);
      } else {
        break;
      }
    }

    while (container.lastChild && container.lastChild.tagName === 'P') {
      const textContent = container.lastChild.textContent || container.lastChild.innerText || '';
      const cleanText = textContent.replace(/[\s\u00A0\u2000-\u200B\u2028-\u2029\u202F\u205F\u3000]/g, '');
      if (cleanText === '') {
        container.removeChild(container.lastChild);
      } else {
        break;
      }
    }
  }

  // Save Quill changes for a specific element
  async saveQuillChanges(type, displayName, button) {
    try {
      const editor = this.editors[type];
      if (!editor) return;

      // Clean up empty paragraphs before getting content
      this.cleanEmptyParagraphs(editor.root);
      
      const currentContent = editor.root.innerHTML;
      const originalContent = type === 'summary' ? this.originalSummary : this.originalDescription;
      
      // Check if content actually changed
      if (currentContent === originalContent) {
        this.disableQuillEditor(type, displayName, button);
        this.showMessage(`No changes detected in ${displayName.toLowerCase()}`, 'info');
        return;
      }

      // Show saving state
      button.innerHTML = `Saving ${displayName}...`;
      button.disabled = true;

      // Save only this specific field
      await this.saveSpecificField(type, currentContent);

      // Update original content to reflect saved state
      if (type === 'summary') {
        this.originalSummary = currentContent;
      } else {
        this.originalDescription = currentContent;
      }

      // Update the original element and preview
      const originalElement = type === 'summary' ? this.summaryElement : this.descriptionElement;
      if (originalElement) {
        originalElement.innerHTML = currentContent;
      }

      const containers = this.editorContainers[type];
      if (containers) {
        containers.previewContainer.innerHTML = currentContent;
      }

      // Clear cache to ensure fresh data on next load
      danDomainAPI.clearCacheForShop(this.platformData.shopId);

      // Show success message
      this.showMessage(`${displayName} saved successfully!`, 'success');

      // Disable editing mode for this element
      this.disableQuillEditor(type, displayName, button);

    } catch (error) {
      console.error(`Failed to save ${type}:`, error);
      this.showMessage(`Failed to save ${displayName.toLowerCase()}: ${error.message}`, 'error');
      
      // Reset button state
      button.innerHTML = `Save ${displayName}`;
      button.disabled = false;
    }
  }

  // Disable Quill editing for a specific element
  disableQuillEditor(type, displayName, button) {
    const containers = this.editorContainers[type];
    if (!containers) return;

    button.dataset.isEditing = 'false';
    button.innerHTML = `Edit ${displayName}`;
    button.style.background = '#1a73e8';
    button.disabled = false;

    // Hide Quill container, show preview
    containers.quillContainer.style.display = 'none';
    containers.previewContainer.style.display = 'block';
  }

  // Save only a specific field to the API
  async saveSpecificField(type, content) {
    // Prepare the update data - only send the field that changed
    const variables = {
      categoryId: this.categoryId.toString(),
      languageId: this.currentLanguageId.toString(),
      title: this.originalTitle // Keep original title
    };

    // Add only the specific field that changed
    if (type === 'summary') {
      variables.summary = content;
    } else if (type === 'description') {
      variables.description = content;
    }

    const mutation = `
      mutation UpdateCategoryTranslations(
        $categoryId: ID!
        $languageId: ID!
        $title: String
        ${type === 'summary' ? '$summary: HTML' : ''}
        ${type === 'description' ? '$description: HTML' : ''}
      ) {
        productCategoryUpdate(
          input: {
            id: $categoryId
            translations: [
              {
                languageId: $languageId
                data: {
                  title: $title
                  ${type === 'summary' ? 'summary: $summary' : ''}
                  ${type === 'description' ? 'description: $description' : ''}
                }
              }
            ]
          }
        ) {
          data {
            updatedAt
            id
            translations {
              data {
                title
                summary
                description
              }
            }
          }
        }
      }
    `;

    console.log(`Updating ${type} for category ${this.categoryId}:`, variables);
    
    return await danDomainAPI.executeGraphQL(
      mutation, 
      variables, 
      `UpdateCategory${type.charAt(0).toUpperCase() + type.slice(1)}`, 
      this.platformData.shopId
    );
  }

  // Check if any changes were made (keeping for compatibility)
  hasChanges() {
    const summaryEditor = this.editors.summary;
    const descriptionEditor = this.editors.description;
    
    const currentSummary = summaryEditor ? summaryEditor.root.innerHTML : this.originalSummary;
    const currentDescription = descriptionEditor ? descriptionEditor.root.innerHTML : this.originalDescription;
    
    return currentSummary !== this.originalSummary || 
           currentDescription !== this.originalDescription;
  }

  // Legacy save method (keeping for compatibility)
  async saveChanges() {
    // This method is now replaced by saveSpecificField for individual elements
    console.warn('saveChanges() is deprecated. Use individual element saving instead.');
  }

  // Revert changes
  revertChanges() {
    if (this.editors.summary) {
      this.editors.summary.root.innerHTML = this.originalSummary;
    }
    if (this.editors.description) {
      this.editors.description.root.innerHTML = this.originalDescription;
    }
    
    this.showMessage('Changes reverted', 'info');
  }

  // Show a temporary message
  showMessage(message, type) {
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      padding: 12px 24px;
      border-radius: 6px;
      color: white;
      font-weight: bold;
      z-index: 10001;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;

    if (type === 'success') {
      messageDiv.style.background = '#34a853';
    } else if (type === 'error') {
      messageDiv.style.background = '#ea4335';
    } else {
      messageDiv.style.background = '#1a73e8';
    }

    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);

    setTimeout(() => {
      messageDiv.remove();
    }, 3000);
  }
}

// Initialize the category editor
const categoryEditor = new CategoryEditor();

// Make it globally accessible for debugging
window.categoryEditor = categoryEditor;

// Add to global scope immediately
if (typeof window !== 'undefined') {
  window.categoryEditor = categoryEditor;
}