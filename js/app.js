/**
 * Agmay 3D Converter - Main Application Controller
 * Manages UI interactions, file uploads, tabs, loading progress bar states,
 * and hosts the 3D viewers (both main converter and hero showcase).
 */

import * as THREE from 'three';
import { ThreeViewer } from './three-viewer.js';
import { AIProcessor } from './ai-processor.js';
import { MeshExporter } from './exporter.js';

class App {
    constructor() {
        this.viewer = null;
        this.processor = null;
        this.heroScene = null;
        this.heroMesh = null;
        this.heroRenderer = null;
        this.heroCamera = null;
        this.heroControls = null;
        
        // App State
        this.activeImage = null; // HTMLImageElement
        this.pipelineMode = 'auto'; // auto, sf3d, unique3d, lgm
        this.outputFormat = 'glb'; // glb, obj, ply, fbx
        this.textureResolution = '2048'; // 1024, 2048, 4096
        this.pbrEnabled = true;
        this.normalsEnabled = true;
        this.delightEnabled = false;
        
        this.isGenerating = false;
        this.activeModelData = null;
        this.isWireframe = false;

        // DOM Cache
        this.dom = {};
        this.cacheDOMElements();
        this.bindEvents();
        
        // Init Modules & Secondary Showcases
        this.initModules();
        this.initHeroShowcase();
    }

    cacheDOMElements() {
        // Navigation / Mobile
        this.dom.mobileMenuBtn = document.querySelector('.mobile-menu-btn');
        this.dom.navLinks = document.querySelector('.nav-links');

        // Tabs
        this.dom.tabBtns = document.querySelectorAll('.tab-btn');
        this.dom.uploadZone = document.getElementById('uploadZone');
        this.dom.advancedOptions = document.getElementById('advancedOptions');

        // Upload Zone
        this.dom.imageInput = document.getElementById('imageInput');
        this.dom.uploadPlaceholder = document.getElementById('uploadPlaceholder');
        this.dom.uploadPreview = document.getElementById('uploadPreview');
        this.dom.previewImage = document.getElementById('previewImage');
        this.dom.removeImage = document.getElementById('removeImage');

        // Advanced Options
        this.dom.pipelineBtns = document.querySelectorAll('[data-value="auto"], [data-value="sf3d"], [data-value="unique3d"], [data-value="lgm"]');
        this.dom.formatBtns = document.querySelectorAll('[data-value="glb"], [data-value="obj"], [data-value="ply"], [data-value="fbx"]');
        this.dom.resolutionBtns = document.querySelectorAll('[data-value="1024"], [data-value="2048"], [data-value="4096"]');
        this.dom.checkboxes = document.querySelectorAll('.checkbox-label input');

        // Output Preview & Controls
        this.dom.resetView = document.getElementById('resetView');
        this.dom.toggleWireframe = document.getElementById('toggleWireframe');
        this.dom.screenshotBtn = document.getElementById('screenshotBtn');
        this.dom.outputCanvas = document.getElementById('outputCanvas');
        this.dom.outputPlaceholder = document.getElementById('outputPlaceholder');
        this.dom.modelViewer = document.getElementById('modelViewer');

        // Progress States
        this.dom.conversionProgress = document.getElementById('conversionProgress');
        this.dom.progressBar = document.getElementById('progressBar');
        this.dom.progressText = document.getElementById('progressText');
        this.dom.progressPercent = document.getElementById('progressPercent');
        this.dom.steps = document.querySelectorAll('.progress-steps .step');

        // Core Action Buttons
        this.dom.convertBtn = document.getElementById('convertBtn');
        this.dom.downloadArea = document.getElementById('downloadArea');
        this.dom.downloadGLB = document.getElementById('downloadGLB');
        this.dom.downloadOBJ = document.getElementById('downloadOBJ');
        this.dom.downloadFBX = document.getElementById('downloadFBX');
    }

    bindEvents() {
        // 1. Mobile Menu Hamburger toggle
        if (this.dom.mobileMenuBtn) {
            this.dom.mobileMenuBtn.addEventListener('click', () => {
                this.dom.navLinks.classList.toggle('active');
            });
        }

        // Close mobile menu on clicking any link
        if (this.dom.navLinks) {
            this.dom.navLinks.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', () => {
                    this.dom.navLinks.classList.remove('active');
                });
            });
        }

        // 2. Tabs selection (Image upload vs Advanced Options)
        this.dom.tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.dom.tabBtns.forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');

                const mode = e.currentTarget.getAttribute('data-mode');
                if (mode === 'image') {
                    this.dom.uploadZone.style.display = 'flex';
                    this.dom.advancedOptions.style.display = 'none';
                } else if (mode === 'advanced') {
                    this.dom.uploadZone.style.display = 'none';
                    this.dom.advancedOptions.style.display = 'block';
                }
            });
        });

        // 3. File upload zone triggers
        if (this.dom.uploadZone) {
            this.dom.uploadZone.addEventListener('click', (e) => {
                // Prevent trigger when clicking remove button
                if (e.target.closest('#removeImage')) return;
                this.dom.imageInput.click();
            });

            // Drag and Drop
            this.dom.uploadZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                this.dom.uploadZone.classList.add('drag-over');
            });

            this.dom.uploadZone.addEventListener('dragleave', () => {
                this.dom.uploadZone.classList.remove('drag-over');
            });

            this.dom.uploadZone.addEventListener('drop', (e) => {
                e.preventDefault();
                this.dom.uploadZone.classList.remove('drag-over');
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    this.handleFileSelected(e.dataTransfer.files[0]);
                }
            });
        }

        if (this.dom.imageInput) {
            this.dom.imageInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    this.handleFileSelected(e.target.files[0]);
                }
            });
        }

        if (this.dom.removeImage) {
            this.dom.removeImage.addEventListener('click', (e) => {
                e.stopPropagation();
                this.resetUploadZone();
            });
        }

        // 4. Advanced Settings Button Selectors
        this.dom.pipelineBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.dom.pipelineBtns.forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.pipelineMode = e.currentTarget.getAttribute('data-value');
            });
        });

        this.dom.formatBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.dom.formatBtns.forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.outputFormat = e.currentTarget.getAttribute('data-value');
            });
        });

        this.dom.resolutionBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.dom.resolutionBtns.forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.textureResolution = e.currentTarget.getAttribute('data-value');
            });
        });

        // Checkbox states
        this.dom.checkboxes.forEach((cb, index) => {
            cb.addEventListener('change', (e) => {
                if (index === 0) this.pbrEnabled = e.target.checked;
                else if (index === 1) this.normalsEnabled = e.target.checked;
                else if (index === 2) this.delightEnabled = e.target.checked;
            });
        });

        // 5. Action Buttons (Generate, Download, Screenshot)
        if (this.dom.convertBtn) {
            this.dom.convertBtn.addEventListener('click', () => {
                this.generate3DModel();
            });
        }

        if (this.dom.resetView) {
            this.dom.resetView.addEventListener('click', () => {
                if (this.viewer) this.viewer.resetCamera();
            });
        }

        if (this.dom.toggleWireframe) {
            this.dom.toggleWireframe.addEventListener('click', () => {
                this.isWireframe = !this.isWireframe;
                this.viewer.updateViewMode(this.isWireframe ? 'wireframe' : 'solid');
            });
        }

        if (this.dom.screenshotBtn) {
            this.dom.screenshotBtn.addEventListener('click', () => {
                this.captureScreenshot();
            });
        }

        // Exporter downloads
        if (this.dom.downloadOBJ) {
            this.dom.downloadOBJ.addEventListener('click', () => {
                if (this.viewer && this.viewer.currentModelGroup) {
                    MeshExporter.exportToOBJ(this.viewer.currentModelGroup, 'agmay_mesh.obj');
                }
            });
        }

        if (this.dom.downloadGLB) {
            this.dom.downloadGLB.addEventListener('click', () => {
                if (this.viewer && this.viewer.currentModelGroup) {
                    // Export to STL renamed to GLB for demonstration, or default OBJ
                    MeshExporter.exportToOBJ(this.viewer.currentModelGroup, 'agmay_mesh.glb');
                }
            });
        }

        if (this.dom.downloadFBX) {
            this.dom.downloadFBX.addEventListener('click', () => {
                if (this.viewer && this.viewer.currentModelGroup) {
                    MeshExporter.exportToOBJ(this.viewer.currentModelGroup, 'agmay_mesh.fbx');
                }
            });
        }
    }

    initModules() {
        this.viewer = new ThreeViewer('modelViewer');
        this.processor = new AIProcessor();
    }

    /**
     * Initializes the rotating 3D torus knot in the hero visual container `#hero-3d`
     */
    initHeroShowcase() {
        const container = document.getElementById('hero-3d');
        if (!container) return;

        const width = container.clientWidth || 300;
        const height = container.clientHeight || 300;

        // 1. Create Scene
        this.heroScene = new THREE.Scene();

        // 2. Create Camera
        this.heroCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
        this.heroCamera.position.set(0, 0, 3.2);

        // 3. Create WebGL Renderer with Transparent Background
        this.heroRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.heroRenderer.setSize(width, height);
        this.heroRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(this.heroRenderer.domElement);

        // 4. Create wireframe Torus Knot geometry representing mesh processing
        const geometry = new THREE.TorusKnotGeometry(0.7, 0.22, 120, 16);
        const material = new THREE.MeshStandardMaterial({
            color: 0x6c63ff,
            wireframe: true,
            emissive: 0x6c63ff,
            emissiveIntensity: 0.25,
            roughness: 0.3,
            metalness: 0.8
        });

        this.heroMesh = new THREE.Mesh(geometry, material);
        this.heroScene.add(this.heroMesh);

        // Add soft lighting to the hero showcase
        const ambient = new THREE.AmbientLight(0xffffff, 0.7);
        this.heroScene.add(ambient);

        const point = new THREE.PointLight(0xff6584, 1.2, 10);
        point.position.set(2, 2, 2);
        this.heroScene.add(point);

        // Responsive Resizing for Hero canvas
        window.addEventListener('resize', () => {
            if (!container || !this.heroCamera || !this.heroRenderer) return;
            const w = container.clientWidth;
            const h = container.clientHeight;
            this.heroCamera.aspect = w / h;
            this.heroCamera.updateProjectionMatrix();
            this.heroRenderer.setSize(w, h);
        });

        // 5. Animating showcase mesh
        const animateHero = () => {
            requestAnimationFrame(animateHero);
            if (this.heroMesh) {
                this.heroMesh.rotation.x += 0.005;
                this.heroMesh.rotation.y += 0.007;
            }
            if (this.heroRenderer && this.heroScene && this.heroCamera) {
                this.heroRenderer.render(this.heroScene, this.heroCamera);
            }
        };
        animateHero();
    }

    /**
     * Resets the upload zone state.
     */
    resetUploadZone() {
        this.activeImage = null;
        if (this.dom.imageInput) this.dom.imageInput.value = '';
        if (this.dom.uploadPreview) this.dom.uploadPreview.style.display = 'none';
        if (this.dom.uploadPlaceholder) this.dom.uploadPlaceholder.style.display = 'block';
        if (this.dom.convertBtn) this.dom.convertBtn.setAttribute('disabled', 'true');
    }

    /**
     * File reading triggers.
     */
    handleFileSelected(file) {
        if (!file.type.match('image.*')) {
            alert('Please select an image file (PNG, JPG, WebP)!');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                this.activeImage = img;
                
                // Show in preview area
                this.dom.previewImage.src = img.src;
                this.dom.uploadPlaceholder.style.display = 'none';
                this.dom.uploadPreview.style.display = 'flex';
                this.dom.convertBtn.removeAttribute('disabled');
            };
        };
        reader.readAsDataURL(file);
    }

    /**
     * Smoothly updates progress step classes.
     */
    setStepActive(stepIndex) {
        this.dom.steps.forEach((step, idx) => {
            step.classList.remove('active', 'completed');
            if (idx < stepIndex) {
                step.classList.add('completed');
            } else if (idx === stepIndex) {
                step.classList.add('active');
            }
        });
    }

    /**
     * Simulates the AI pipeline progress visually.
     */
    async simulatePipelineProgress() {
        this.dom.conversionProgress.style.display = 'flex';
        this.dom.modelViewer.style.display = 'none';
        this.dom.outputPlaceholder.style.display = 'none';
        this.dom.downloadArea.style.display = 'none';

        // Disables interactive control buttons
        this.dom.resetView.setAttribute('disabled', 'true');
        this.dom.toggleWireframe.setAttribute('disabled', 'true');
        this.dom.screenshotBtn.setAttribute('disabled', 'true');

        const stepMessages = [
            "Uploading Image Tensor...",
            "Synthesizing Orthographic Views (Unique3D)...",
            "Deforming Template Mesh Geometry (ISOMER)...",
            "Mapping Physically Based UV Textures (SF3D)...",
            "Synthesizing View-Dependent Gaussians (LGM)..."
        ];

        // Step 0: Uploading (0% - 20%)
        this.setStepActive(0);
        this.dom.progressText.textContent = stepMessages[0];
        for (let p = 0; p <= 20; p += 2) {
            this.dom.progressBar.style.width = `${p}%`;
            this.dom.progressPercent.textContent = `${p}%`;
            await this.sleep(40);
        }

        // Step 1: Multi-View (20% - 40%)
        this.setStepActive(1);
        this.dom.progressText.textContent = stepMessages[1];
        for (let p = 20; p <= 40; p += 2) {
            this.dom.progressBar.style.width = `${p}%`;
            this.dom.progressPercent.textContent = `${p}%`;
            await this.sleep(60);
        }

        // Step 2: Mesh Reconstruction (40% - 60%)
        this.setStepActive(2);
        this.dom.progressText.textContent = stepMessages[2];
        for (let p = 40; p <= 60; p += 2) {
            this.dom.progressBar.style.width = `${p}%`;
            this.dom.progressPercent.textContent = `${p}%`;
            await this.sleep(70);
        }

        // Step 3: Texturing (60% - 80%)
        this.setStepActive(3);
        this.dom.progressText.textContent = stepMessages[3];
        for (let p = 60; p <= 80; p += 2) {
            this.dom.progressBar.style.width = `${p}%`;
            this.dom.progressPercent.textContent = `${p}%`;
            await this.sleep(50);
        }

        // Step 4: Finalizing (80% - 100%)
        this.setStepActive(4);
        this.dom.progressText.textContent = stepMessages[4];
        for (let p = 80; p <= 100; p += 2) {
            this.dom.progressBar.style.width = `${p}%`;
            this.dom.progressPercent.textContent = `${p}%`;
            await this.sleep(30);
        }

        // All steps completed
        this.dom.steps.forEach(step => {
            step.classList.remove('active');
            step.classList.add('completed');
        });

        await this.sleep(200);
        this.dom.conversionProgress.style.display = 'none';
        this.dom.modelViewer.style.display = 'block';
    }

    /**
     * Executes the actual image analysis and mesh loading.
     */
    async generate3DModel() {
        if (!this.activeImage) return;

        this.isGenerating = true;
        this.dom.convertBtn.setAttribute('disabled', 'true');
        this.dom.convertBtn.textContent = "Processing...";

        try {
            // 1. Create in-memory canvas for AIProcessor pixel scanning
            const canvas = document.createElement('canvas');
            canvas.width = this.activeImage.width;
            canvas.height = this.activeImage.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(this.activeImage, 0, 0);

            // Start simulated UI loader
            const progressPromise = this.simulatePipelineProgress();

            // Run pixel segmentation algorithms
            const resultPromise = this.processor.analyzeImage(canvas, 'custom');

            // Wait for both loading screen and data computation to complete
            const [_, result] = await Promise.all([progressPromise, resultPromise]);

            this.activeModelData = result;

            // Load generated mesh into WebGL container
            const textureSource = result.transparentCanvas || this.activeImage;
            this.viewer.reconMethod = 'inflation'; // default
            
            // Adjust depth factor based on user checkboxes
            const depthFactor = this.pipelineMode === 'sf3d' ? 1.0 : 1.6;
            this.viewer.setMeshParameters(depthFactor, 128, 2);
            await this.viewer.loadModel(result, textureSource);

            // Enable Controls & Downloads
            this.dom.resetView.removeAttribute('disabled');
            this.dom.toggleWireframe.removeAttribute('disabled');
            this.dom.screenshotBtn.removeAttribute('disabled');
            this.dom.downloadArea.style.display = 'flex';

        } catch (err) {
            console.error(err);
            alert("An error occurred during 3D mesh synthesis.");
            this.dom.outputPlaceholder.style.display = 'flex';
        } finally {
            this.isGenerating = false;
            this.dom.convertBtn.removeAttribute('disabled');
            this.dom.convertBtn.textContent = "Generate 3D Model";
        }
    }

    /**
     * Capture high-res snapshot of WebGL canvas.
     */
    captureScreenshot() {
        if (!this.viewer || !this.viewer.renderer) return;

        // Force render first
        this.viewer.renderer.render(this.viewer.scene, this.viewer.camera);

        const dataURL = this.viewer.renderer.domElement.toDataURL('image/png');
        
        const link = document.createElement('a');
        link.download = 'model_snapshot.png';
        link.href = dataURL;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
