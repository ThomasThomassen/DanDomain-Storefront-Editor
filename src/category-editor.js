const LICENSE_KEY = 'GPL';

import {
	ClassicEditor,
	Autoformat,
	Bold,
	Italic,
	Underline,
	Essentials,
	Heading,
	Indent,
	IndentBlock,
	Link,
	List,
	MediaEmbed,
	Paragraph,
	PasteFromOffice,
	TextTransformation,
	GeneralHtmlSupport
} from 'ckeditor5';

// WYSIWYG Editor for Category Content using CKEditor5
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
    this.editors = {}; // Store CKEditor instances
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

  // Setup the editor interface
  setupEditor(summaryElement, descriptionElement) {
    // Store references to original elements
    this.summaryElement = summaryElement;
    this.descriptionElement = descriptionElement;

    // Store original content
    if (summaryElement) {
      this.originalSummary = summaryElement.innerHTML;
      this.setupCKEditor(summaryElement, 'summary', 'Summary');
    }
    if (descriptionElement) {
      this.originalDescription = descriptionElement.innerHTML;
      this.setupCKEditor(descriptionElement, 'description', 'Description');
    }
  }

  // Setup CKEditor for a specific element
  setupCKEditor(element, type, displayName) {
    // Create a container for the edit button and CKEditor
    const editorContainer = this.createEditorContainer(type, displayName, element);
    
    // Insert container before the original element
    if (element.parentNode) {
      element.parentNode.insertBefore(editorContainer, element);
      // Hide the original element initially
      element.style.display = 'none';
    }
  }

  // Create a container with edit button and CKEditor
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

    // Create editor container (initially hidden)
    const editorContainer = document.createElement('div');
    editorContainer.id = `dd-editor-container-${type}`;
    editorContainer.style.cssText = `
      display: none;
    `;

    // Create preview container (shows original content when not editing)
    const previewContainer = document.createElement('div');
    previewContainer.id = `dd-preview-container-${type}`;
    this.originalElements[type] = originalElement;
    previewContainer.innerHTML = originalElement.innerHTML;
    previewContainer.className = originalElement.className;

    container.appendChild(header);
    container.appendChild(editorContainer);
    container.appendChild(previewContainer);

    // Store container reference
    this.editorContainers[type] = {
      container,
      editorContainer,
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

    button.addEventListener('click', async () => {
      await this.toggleCKEditor(type, displayName, button);
    });

    return button;
  }

  // Toggle CKEditor for a specific element
  async toggleCKEditor(type, displayName, button) {
    const isEditing = button.dataset.isEditing === 'true';
    
    if (isEditing) {
      // Save changes for this specific element
      await this.saveCKEditorChanges(type, displayName, button);
    } else {
      // Enable editing for this element
      await this.enableCKEditor(type, displayName, button);
    }
  }

  // Enable CKEditor editing for a specific element
  async enableCKEditor(type, displayName, button) {
    const containers = this.editorContainers[type];
    if (!containers) return;

    button.dataset.isEditing = 'true';
    button.innerHTML = `Save ${displayName}`;
    button.style.background = '#34a853';

    // Initialize CKEditor if not already done
    if (!this.editors[type]) {
      await this.initializeCKEditor(type, containers.editorContainer, containers.container);
    }

    // Show the actual CKEditor element, hide preview
    const ckEditor = containers.container.querySelector('.ck-editor');
    if (ckEditor) {
      ckEditor.style.display = 'block';
    }
    containers.previewContainer.style.display = 'none';

    // Set content directly to preserve exact HTML structure and styling
    const originalContent = type === 'summary' ? this.originalSummary : this.originalDescription;
    
    if (originalContent && originalContent.trim() && this.editors[type]) {
      // Set HTML content in CKEditor - it should preserve the structure better than Quill
      this.editors[type].setData(originalContent);
    }
    
    // Focus the editor
    if (this.editors[type] && this.editors[type].editing) {
      this.editors[type].editing.view.focus();
    }
  }

  // Initialize CKEditor instance with full DanDomain configuration
  async initializeCKEditor(type, editorContainer, parentContainer) {
    try {
      // Create CKEditor directly in the main container, not in the empty editorContainer
      const editor = await ClassicEditor.create(editorContainer, {
        licenseKey: LICENSE_KEY,
        plugins: [
          Essentials,
          Autoformat,
          Bold,
          Italic,
          Underline,
          Heading,
          Indent,
          IndentBlock,
          Link,
          List,
          MediaEmbed,
          Paragraph,
          PasteFromOffice,
          TextTransformation,
          GeneralHtmlSupport
        ],
        language: "en",
        link: {
          decorators: {
            openInNewTab: {
              mode: "manual",
              label: "Open link in new tab",
              attributes: {
                target: "_blank",
                rel: "noopener noreferrer"
              }
            }
          }
        },
        table: {
          contentToolbar: ["tableColumn", "tableRow", "mergeTableCells"]
        },
        heading: {
          options: [{
            model: "paragraph",
            title: "Paragraph",
            class: "ck-heading_paragraph"
          }, {
            model: "heading1",
            view: "h2",
            title: "Heading 2",
            class: "ck-heading_heading1"
          }, {
            model: "heading2",
            view: "h3",
            title: "Heading 3",
            class: "ck-heading_heading2"
          }, {
            model: "heading3",
            view: "h4",
            title: "Heading 4",
            class: "ck-heading_heading3"
          }]
        },
        htmlSupport: {
          allow: [{
            name: "a",
            attributes: {
              rel: true,
              href: true,
              target: true
            },
            classes: true,
            styles: true
          }, {
            name: /.*/,
            attributes: true,
            classes: true,
            styles: true
          }],
          disallow: [
            // Don't disallow any classes - preserve everything
          ]
        },
        toolbar: {
          shouldNotGroupWhenFull: true,
          items: [
            "undo", "redo", "|",
            "heading", "|",
            "bold", "italic", "underline", "link", "|",
            "bulletedList", "numberedList", "|",
            "outdent", "indent"
          ]
        }
      });

      this.editors[type] = editor;

      // Customize CKEditor styling to match our design and hide it initially
      const editorElement = parentContainer.querySelector('.ck-editor');
      if (editorElement) {
        editorElement.style.cssText = `
          border: 1px solid #e0e0e0;
          border-radius: 4px;
          display: none;
        `;
      }

      const toolbar = parentContainer.querySelector('.ck-toolbar');
      if (toolbar) {
        toolbar.style.cssText = `
          border: none;
          border-bottom: 1px solid #e0e0e0;
          padding: 8px 12px;
          background: white;
          border-radius: 4px 4px 0 0;
        `;
      }

      const editingView = parentContainer.querySelector('.ck-editor__editable');
      if (editingView) {
        // Apply original element classes to maintain styling
        const originalElementClasses = this.originalElements[type].classList;
        
        // Get computed styles from original element first
        const originalElement = this.originalElements[type];
        const originalStyles = window.getComputedStyle(originalElement);
        
        // Function to reapply classes
        const reapplyClasses = () => {
          // Remove any existing original classes first to avoid duplicates
          originalElementClasses.forEach(className => {
            editingView.classList.remove(className);
          });
          // Add them back
          editingView.classList.add(...originalElementClasses);
          
          // Reapply background styles more aggressively after class changes
          const backgroundProperties = ['background-color', 'background-image', 'background', 'background-position', 'background-repeat', 'background-size'];
          backgroundProperties.forEach(property => {
            const value = originalStyles.getPropertyValue(property);
            if (value && value !== 'normal' && value !== 'auto' && value !== 'initial' && value !== 'inherit') {
              editingView.style.setProperty(property, value, 'important');
              
              // Also apply to editor container
              const editorContainer = parentContainer.querySelector('.ck-editor');
              if (editorContainer) {
                editorContainer.style.setProperty(property, value, 'important');
              }
            }
          });
        };
        
        // Apply classes initially
        reapplyClasses();
        
        // Monitor for class changes using MutationObserver
        const classObserver = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
              // Check if our original classes are missing
              const hasAllClasses = Array.from(originalElementClasses).every(className => 
                editingView.classList.contains(className)
              );
              
              if (!hasAllClasses) {
                console.log(`CKEditor removed classes for ${type}, reapplying...`);
                reapplyClasses();
              }
            }
          });
        });
        
        // Start observing class changes
        classObserver.observe(editingView, {
          attributes: true,
          attributeFilter: ['class']
        });
        
        // Store observer for cleanup later
        if (!this.classObservers) {
          this.classObservers = {};
        }
        this.classObservers[type] = classObserver;
        
        // Also listen to CKEditor's internal events for more comprehensive coverage
        editor.model.document.on('change:data', () => {
          // Reapply classes after any content change
          setTimeout(reapplyClasses, 10);
        });
        
        // Listen to focus events
        editor.editing.view.on('render', () => {
          setTimeout(reapplyClasses, 10);
        });
        
        // Apply critical styling properties that might be lost
        const importantStyles = [
          'font-family', 'font-size', 'line-height', 'color', 
          'text-align', 'letter-spacing', 'text-transform',
          'background-color', 'background-image', 'background', 
          'background-position', 'background-repeat', 'background-size'
        ];
        
        importantStyles.forEach(property => {
          const value = originalStyles.getPropertyValue(property);
          if (value && value !== 'normal' && value !== 'auto') {
            editingView.style.setProperty(property, value, 'important');
            
            // For background properties, also apply to the parent container for inheritance
            if (property.startsWith('background')) {
              const editorContainer = parentContainer.querySelector('.ck-editor');
              if (editorContainer) {
                editorContainer.style.setProperty(property, value, 'important');
              }
            }
          }
        });
        
        // Create a dynamic style element for this specific editor
        const editorStyleId = `dd-editor-styles-${type}`;
        let editorStyleElement = document.getElementById(editorStyleId);
        
        if (!editorStyleElement) {
          editorStyleElement = document.createElement('style');
          editorStyleElement.id = editorStyleId;
          document.head.appendChild(editorStyleElement);
        }
        
        // Generate CSS rules that specifically target this editor with the original classes
        const originalClassSelector = Array.from(originalElementClasses).map(cls => `.${cls}`).join('');
        const editorSelector = `#dd-category-editor-container-${type} .ck-editor__editable${originalClassSelector}`;
        const editorSelectorGeneral = `#dd-category-editor-container-${type} .ck-editor__editable`;
        
        // Extract important styles and create CSS rules
        let dynamicCSS = '';
        let backgroundCSS = '';
        
        importantStyles.forEach(property => {
          const value = originalStyles.getPropertyValue(property);
          if (value && value !== 'normal' && value !== 'auto' && value !== 'initial' && value !== 'inherit') {
            // Special handling for background properties
            if (property.startsWith('background')) {
              backgroundCSS += `${property}: ${value} !important;\n`;
            } else {
              dynamicCSS += `${property}: ${value} !important;\n`;
            }
          }
        });
        
        if (dynamicCSS || backgroundCSS) {
          editorStyleElement.textContent = `
            /* Styles with original classes */
            ${editorSelector} {
              ${dynamicCSS}
              ${backgroundCSS}
            }
            
            /* Background styles without class requirement - higher specificity */
            ${editorSelectorGeneral} {
              ${backgroundCSS}
            }
            
            /* Ensure content within the editor also inherits properly */
            ${editorSelector} * {
              font-family: inherit;
              line-height: inherit;
            }
            
            /* Override CKEditor's default background with extreme specificity */
            ${editorSelectorGeneral}.ck-editor__editable.ck-focused,
            ${editorSelectorGeneral}.ck-editor__editable,
            ${editorSelectorGeneral} {
              ${backgroundCSS}
            }
          `;
        }
      }

      console.log(`CKEditor initialized for ${type}`);

    } catch (error) {
      console.error(`Failed to initialize CKEditor for ${type}:`, error);
    }
  }

  // Save CKEditor changes for a specific element
  async saveCKEditorChanges(type, displayName, button) {
    try {
      const editor = this.editors[type];
      if (!editor) return;

      // Get content from CKEditor
      const currentContent = editor.getData();
      const originalContent = type === 'summary' ? this.originalSummary : this.originalDescription;
      
      // Check if content actually changed
      if (currentContent === originalContent) {
        this.disableCKEditor(type, displayName, button);
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
      this.disableCKEditor(type, displayName, button);

    } catch (error) {
      console.error(`Failed to save ${type}:`, error);
      this.showMessage(`Failed to save ${displayName.toLowerCase()}: ${error.message}`, 'error');
      
      // Reset button state
      button.innerHTML = `Save ${displayName}`;
      button.disabled = false;
    }
  }

  // Disable CKEditor editing for a specific element
  disableCKEditor(type, displayName, button) {
    const containers = this.editorContainers[type];
    if (!containers) return;

    // Clean up class observer if it exists
    if (this.classObservers && this.classObservers[type]) {
      this.classObservers[type].disconnect();
      delete this.classObservers[type];
    }
    
    // Clean up dynamic styles
    const editorStyleId = `dd-editor-styles-${type}`;
    const editorStyleElement = document.getElementById(editorStyleId);
    if (editorStyleElement) {
      editorStyleElement.remove();
    }

    button.dataset.isEditing = 'false';
    button.innerHTML = `Edit ${displayName}`;
    button.style.background = '#1a73e8';
    button.disabled = false;

    // Hide the actual CKEditor element, show preview
    const ckEditor = containers.container.querySelector('.ck-editor');
    if (ckEditor) {
      ckEditor.style.display = 'none';
    }
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

// Make it globally accessible for debugging and content.js compatibility
window.categoryEditor = categoryEditor;

// Also expose the instance globally as 'categoryEditor' for content.js
if (typeof window !== 'undefined') {
  window.categoryEditor = categoryEditor;
  // Also expose at global scope for direct access
  window.CategoryEditor = CategoryEditor;
}

// Export both the class and instance
export default CategoryEditor;
export { categoryEditor };
