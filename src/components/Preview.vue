<template>
    <main id="preview" class="preview">
        <div id="canvas_wrapper">
            <div id="overlay_timestamp">{{ timestamp }}</div>
            <canvas id="canvas" @click="blur()" ref="canvas"
                @pointerdown="onCanvasPointerDown" @pointermove="onCanvasHover"
                @dblclick="onCanvasDblClick" @contextmenu="onCanvasContextMenu"></canvas>
            <div class="placeholder_bar" v-if="show_placeholder_bar">
                <ul>
                    <li v-for="(key) in placeholder_keys" :key="key">
                        <label :for="'placeholder_'+key">{{ key.replace(key.substring(1, key.indexOf('.')), '') }}</label>
                        <input type="number" :id="'placeholder_'+key" :value="placeholder_values[key] || 0" @input="updatePlaceholderValue(key, $event)">
                        <div class="tool" v-if="key.startsWith('variable')" @click="bakePlaceholderVariable(key)" title="Bake variable value into all expressions">
                            <CheckCheck :size="20" />
                        </div>
                    </li>
                    <li v-if="placeholder_keys.length == 0"><label>No undefined variables found</label></li>
                </ul>

                <div class="tool" @click="hidePlaceholderBar()" title="Hide Variable Placeholder Bar">
                    <X :size="22" />
                </div>
            </div>
        </div>
        <footer>
            <select id="loop_mode" v-model="loop_mode" @change="changeLoopMode()">
                <option value="auto">Auto</option>
                <option value="looping">Looping</option>
                <option value="once">Once</option>
            </select>
            <select id="parent_mode" v-model="parent_mode" @change="changeParentMode()">
                <option value="world">World</option>
                <option value="entity">Entity</option>
                <option value="locator">Locator</option>
            </select>
            <select id="time_of_day" v-model="time_of_day" @change="setTimeOfDay()" :title="$t('preview.time')">
                <option value="default">{{ $t('time.default') }}</option>
                <option value="day">{{ $t('time.day') }}</option>
                <option value="sunset">{{ $t('time.sunset') }}</option>
                <option value="night">{{ $t('time.night') }}</option>
                <option value="cave">{{ $t('time.cave') }}</option>
            </select>
            <div class="tool ground_collision" :class="{toggle_enabled: collision}" @click="toggleCollision()" :title="$t('preview.collisions')">
                <FlipVertical2 :size="20" v-if="collision" />
                <Minus :size="20" v-else />
            </div>
            <div class="tool" :class="{toggle_enabled: show_placeholder_bar}" @click="show_placeholder_bar ? hidePlaceholderBar() : showPlaceholderBar()" :title="$t('preview.variables')">
                <Hash :size="22" />
            </div>
            <div class="tool" :class="{toggle_enabled: show_path}" @click="toggleTrajectoryPath()" :title="$t('preview.path')">
                <Spline :size="20" />
            </div>
            <div class="tool" :class="{toggle_enabled: show_rotation}" @click="toggleTrajectoryRotation()" :title="$t('preview.rotation')">
                <RotateCw :size="20" />
            </div>
            <div class="tool" :class="{toggle_enabled: show_texture_path}" @click="toggleTrajectoryTexture()" :title="$t('preview.texpath')">
                <ImageIcon :size="20" />
            </div>
            <div class="tool" :class="{toggle_enabled: show_shape}" @click="toggleShapeGizmo()" :title="$t('preview.shape')">
                <Box :size="20" />
            </div>
            <div class="tool" :class="{toggle_enabled: path_edit_mode}" @click="togglePathEdit()" :title="$t('preview.pathedit')">
                <Hand :size="20" />
            </div>

            <div class="spacing" />

            <div class="tool" @click="startAnimation()" :title="$t('preview.play')">
                <Play :size="22" />
            </div>
            <div class="tool" @click="togglePause()" :title="$t('preview.pause')">
                <Pause :size="22" />
            </div>

            <!--Scrubbable timeline-->
            <div class="timeline_track" ref="timeline" @mousedown="scrubStart" title="Drag to scrub through the effect">
                <div class="timeline_fill" :style="{width: playhead + '%'}"></div>
                <div class="timeline_head" :style="{left: playhead + '%'}"></div>
            </div>

            <div class="tool warning" @click="$emit('opendialog', 'warnings')" v-if="warning_count" :title="getWarningTitle()"><i class="unicode_icon warn">⚠</i>{{ warning_count }}</div>
            <div class="stat">{{particle_counter}} P</div>
            <div class="stat" style="width: 66px;">{{fps}} FPS</div>
        </footer>

        <dialog id="bake_placeholder_confirm_dialog" ref="bake_placeholder_confirm_dialog" class="modal_dialog" style="max-width: 308px;">
            <div class="form_bar">Do you want to replace all occurrences of '{{ bake_placeholder_key }}' with the value '{{ placeholder_values[bake_placeholder_key] }}'?</div>
            <div class="button_bar">
                <button @click="bakePlaceholderVariableConfirm()">Confirm</button>
                <button @click="$refs.bake_placeholder_confirm_dialog.close()">Cancel</button>
            </div>
        </dialog>
    </main>
</template>

<script>

    import * as THREE from 'three';
    import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

    import {Emitter, Scene, initParticles} from './../emitter';
    import {Trajectory} from './../trajectory';
    import {ShapeGizmo} from './../shape_gizmo';
    import {PathEditor} from './../path_editor';
    import {validate} from './WarningDialog'

    import {OptionValues} from './../options'

    import minecraft_block from '../../assets/minecraft_block.png'

    import {
        FlipVertical2,
        Minus,
        Play,
        Pause,
        Hash,
        X,
        CheckCheck,
        Spline,
        RotateCw,
        Box,
        Image as ImageIcon,
        Hand
    } from 'lucide-vue'

    import {EditListeners} from '../edits'

    import {updateVariablePlaceholderList, bakePlaceholderVariable} from './../variable_placeholders'

    // Time-of-day environment presets for the preview background.
    const TIME_PRESETS = {
        day:    0x7fa8d0,
        sunset: 0x6e4a52,
        night:  0x141c28,
        cave:   0x0b0d10,
    };
    let BACKGROUND_COLOR = TIME_PRESETS[localStorage.getItem('snowstorm_time_of_day')] || 0x29323a;

    const View = {
        updateVariablePlaceholderList() {},
        PlaybackController: {
            start() {
                if (!Emitter.initialized || Emitter.age == 0) {
                    Emitter.start();
                }
                Emitter.paused = false;
                return View.PlaybackController;
            },
            toggle() {
                Emitter.paused = !Emitter.paused;
                if (!Emitter.paused) {
                    View.PlaybackController.start();
                }
                return View.PlaybackController;
            },
            stop() {
                Emitter.stop(true);
                Emitter.paused = true;
                return View.PlaybackController;
            }
        }
    }

    const stats = {
        time: 0
    };
    
    const gizmo_colors = {
        r: new THREE.Color(0xfd3043),
        g: new THREE.Color(0x26ec45),
        b: new THREE.Color(0x2d5ee8),
        grid: new THREE.Color(0x3d4954),
    }

    function CustomAxesHelper( size ) {
        size = size || 1;
        var vertices = [
            0, 0, 0,	size, 0, 0,
            0, 0, 0,	0, size, 0,
            0, 0, 0,	0, 0, size
        ];
        var c = gizmo_colors
        var colors = [
            c.r.r, c.r.g, c.r.b,	c.r.r, c.r.g, c.r.b, 
            c.g.r, c.g.g, c.g.b,	c.g.r, c.g.g, c.g.b, 
            c.b.r, c.b.g, c.b.b,	c.b.r, c.b.g, c.b.b,
        ]
        var geometry = new THREE.BufferGeometry();
        geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );
        geometry.setAttribute( 'color', new THREE.Float32BufferAttribute( colors, 3 ) );
        var material = new THREE.LineBasicMaterial( { vertexColors: 2 } );
        return new THREE.LineSegments(geometry, material );
    }
    CustomAxesHelper.prototype = Object.create( THREE.LineSegments.prototype );

    View.screenshot = function() {
        // Set clear background
        let color = new THREE.Color(BACKGROUND_COLOR);
        View.renderer.setClearColor(color, 0);
        View.renderer.render(View.scene, View.camera);
        let dataurl = View.canvas.toDataURL()
        View.renderer.setClearColor(color);

        let is_ff = navigator.userAgent.toLowerCase().indexOf('firefox') > -1
        let download = document.createElement('a');
        download.href = dataurl
        download.download = `snowstorm_screenshot.png`;
        if (is_ff) document.body.appendChild(download);
        download.click();
        if (is_ff) document.body.removeChild(download);

    }

    
    function startAnimation() {
        View.PlaybackController.stop().start();
    }
    function togglePause() {
        View.PlaybackController.toggle();
    }


    function initPreview(canvas) {

        View.canvas = canvas
        View.camera = new THREE.PerspectiveCamera(45, 16/9, 0.1, 3000);
        View.camera.position.set(-6, 3, -6)
        View.renderer = new THREE.WebGLRenderer({
            canvas: View.canvas,
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true,
        })
        View.renderer.setClearColor(new THREE.Color(BACKGROUND_COLOR));

        View.controls = new OrbitControls(View.camera, View.canvas);
        View.controls.target.set(0, 0.8, 0)
        View.controls.screenSpacePanning = true;
        View.controls.zoomSpeed = 1.4

        View.scene = new THREE.Scene()

        View.helper = new CustomAxesHelper(1);
        View.grid = new THREE.GridHelper(64, 64, gizmo_colors.grid, gizmo_colors.grid);
        View.grid.position.y -= 0.0005
        View.scene.add(View.helper);
        View.scene.add(View.grid);
        View.helper.visible = OptionValues.axis_helper_visible;
        View.grid.visible = OptionValues.grid_visible;

        let cube_geometry = new THREE.BoxGeometry(1, 1, 1);
		cube_geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(24 * 3).fill(0.3), 3));
        let setupFace = (offset, uv, shade) => {
            for (let i = 0; i < 4; i++) {
                uv[i] = Math.lerp(uv[i], uv[(i+2) % 4], 0.002);
            }
            cube_geometry.attributes.uv.array[offset*2+0] = uv[0];
            cube_geometry.attributes.uv.array[offset*2+1] = uv[1];
            cube_geometry.attributes.uv.array[offset*2+2] = uv[2];
            cube_geometry.attributes.uv.array[offset*2+3] = uv[1];
            cube_geometry.attributes.uv.array[offset*2+4] = uv[0];
            cube_geometry.attributes.uv.array[offset*2+5] = uv[3];
            cube_geometry.attributes.uv.array[offset*2+6] = uv[2];
            cube_geometry.attributes.uv.array[offset*2+7] = uv[3];
            for (let i = 0; i < 4; i++) {
                cube_geometry.attributes.color.setXYZ((offset + i), shade, shade, shade);
            }
        }
        setupFace(0, [0, 0.5, 0.5, 0.0], 0.64); // East/West
        setupFace(4, [0, 0.5, 0.5, 0.0], 0.64); // East/West
        setupFace(8, [0, 0.5, 0.5, 1], 1); // Up
        setupFace(12, [0.5, 0.5, 1, 0.0], 0.5); // Down
        setupFace(16, [0, 0.5, 0.5, 0.0], 0.8); // North/South
        setupFace(20, [0, 0.5, 0.5, 0.0], 0.8); // North/South
        cube_geometry.attributes.uv.needsUpdate = true;
        cube_geometry.attributes.color.needsUpdate = true;
        let cube_texture = new THREE.TextureLoader().load(minecraft_block);
		cube_texture.magFilter = THREE.NearestFilter;
		cube_texture.minFilter = THREE.NearestFilter;
        let cube_material = new THREE.MeshBasicMaterial({
            vertexColors: true,
            map: cube_texture
        });
        View.minecraft_block = new THREE.Mesh(cube_geometry, cube_material);
        View.minecraft_block.position.set(0, -0.51, 0);
        View.scene.add(View.minecraft_block);
        View.minecraft_block.visible = OptionValues.minecraft_block_visible;

        initParticles(View)

        resizeCanvas()
        animate()

    }
    let last_frame_time = performance.now();
    function animate() {
        requestAnimationFrame(animate);

        let timestamp = performance.now();
        if (timestamp - last_frame_time > 32) {
            last_frame_time = timestamp;
            if (!Emitter.paused) {
                Emitter.tick();
            }
        }

        if (View.canvas.offsetParent && (!Emitter.paused || !document.hasFocus || document.hasFocus())) {
            View.controls.update()
            Scene.updateFacingRotation(View.camera);
            View.renderer.render(View.scene, View.camera);
            View.frames_this_second++;
            stats.time = Emitter.age;
        }
    }
    function resizeCanvas() {
        var wrapper = View.canvas.parentNode;
        var height = wrapper.clientHeight
        var width = wrapper.clientWidth

        View.camera.aspect = width/height;
        View.camera.updateProjectionMatrix();

        View.renderer.setSize(width, height);
        View.renderer.setPixelRatio(window.devicePixelRatio);
    }
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', () => {
        setTimeout(resizeCanvas, 150)
    });

    window.addEventListener('keypress', (e) => {
        var input_focus = document.querySelector('input:focus, div[contenteditable="true"]:focus, textarea:focus')
        if (input_focus) return;

        if (e.which === 32 && e.ctrlKey) {
            togglePause()
        } else if (e.which === 32) {
            startAnimation()
        }
    })

    View.placeholder_variables = {};
	View.frames_this_second = 0;

    export default {
        name: 'preview',
        data() {return {
            fps: 0,
            particles: 0,
            loop_mode: 'auto',
            parent_mode: 'world',
            warning_count: 0,
            stats,
            collision: true,
            placeholder_keys: [],
            placeholder_values: {},
            show_placeholder_bar: localStorage.getItem('snowstorm_show_placeholder_bar') == 'true',
            show_path: false,
            show_rotation: false,
            show_texture_path: false,
            show_shape: false,
            path_edit_mode: false,
            time_of_day: localStorage.getItem('snowstorm_time_of_day') || 'default',
            playhead: 0,
            bake_placeholder_key: null
        }},
        components: {
            FlipVertical2,
            Minus,
            Play,
            Pause,
            Hash,
            X,
            CheckCheck,
            Spline,
            RotateCw,
            Box,
            ImageIcon,
            Hand,
        },
        methods: {
            togglePathEdit() {
                this.path_edit_mode = !this.path_edit_mode;
                PathEditor.setActive(this.path_edit_mode);
            },
            pointerToNDC(event) {
                let rect = View.canvas.getBoundingClientRect();
                return new THREE.Vector2(
                    ((event.clientX - rect.left) / rect.width) * 2 - 1,
                    -((event.clientY - rect.top) / rect.height) * 2 + 1
                );
            },
            raycastHandles(event) {
                this._raycaster.setFromCamera(this.pointerToNDC(event), View.camera);
                return this._raycaster.intersectObjects(PathEditor.handleMeshes, false);
            },
            onCanvasPointerDown(event) {
                if (!this.path_edit_mode || event.button !== 0) return;
                let hits = this.raycastHandles(event);
                if (!hits.length) return; // missed a handle → let OrbitControls orbit
                this._dragIndex = hits[0].object.userData.pathHandle;
                let handleWorld = new THREE.Vector3();
                PathEditor.handles[this._dragIndex].getWorldPosition(handleWorld);
                let normal = new THREE.Vector3();
                View.camera.getWorldDirection(normal);
                this._dragPlane.setFromNormalAndCoplanarPoint(normal, handleWorld);
                View.controls.enabled = false;
                event.preventDefault();
                document.addEventListener('pointermove', this._boundPathMove);
                document.addEventListener('pointerup', this._boundPathUp);
            },
            handlePathMove(event) {
                if (this._dragIndex < 0) return;
                this._raycaster.setFromCamera(this.pointerToNDC(event), View.camera);
                let hit = new THREE.Vector3();
                if (this._raycaster.ray.intersectPlane(this._dragPlane, hit)) {
                    let space = PathEditor.space;
                    let local = space ? space.worldToLocal(hit.clone()) : hit;
                    PathEditor.dragTo(this._dragIndex, local);
                }
            },
            handlePathUp() {
                if (this._dragIndex >= 0) PathEditor.endDrag();
                this._dragIndex = -1;
                View.controls.enabled = true;
                document.removeEventListener('pointermove', this._boundPathMove);
                document.removeEventListener('pointerup', this._boundPathUp);
            },
            onCanvasHover(event) {
                if (!this.path_edit_mode || this._dragIndex >= 0) return;
                let hits = this.raycastHandles(event);
                PathEditor.setHovered(hits.length ? hits[0].object.userData.pathHandle : -1);
            },
            onCanvasDblClick(event) {
                if (!this.path_edit_mode) return;
                let hits = this.raycastHandles(event);
                if (hits.length) PathEditor.addPointAfter(hits[0].object.userData.pathHandle);
            },
            onCanvasContextMenu(event) {
                if (!this.path_edit_mode) return;
                let hits = this.raycastHandles(event);
                if (hits.length) { event.preventDefault(); PathEditor.removePoint(hits[0].object.userData.pathHandle); }
            },
            updateSize() {
                resizeCanvas()
            },
            showPlaceholderBar() {
                this.show_placeholder_bar = true;
                updateVariablePlaceholderList(this.placeholder_keys);
                localStorage.setItem('snowstorm_show_placeholder_bar', 'true');
            },
            hidePlaceholderBar() {
                this.show_placeholder_bar = false;
                localStorage.setItem('snowstorm_show_placeholder_bar', 'false');
            },
            updatePlaceholderValue(key, event) {
                this.placeholder_values[key] = parseFloat(event.target.value) || 0;
                for (let key in View.placeholder_variables) {
                    delete View.placeholder_variables[key];
                }
                for (let key of this.placeholder_keys) {
                    if (!this.placeholder_values[key]) this.placeholder_values[key] = 0;
                    View.placeholder_variables[key] = this.placeholder_values[key];
                }
            },
            bakePlaceholderVariableConfirm() {
                this.$refs.bake_placeholder_confirm_dialog.close();
                let key = this.bake_placeholder_key;
                bakePlaceholderVariable(key, this.placeholder_values[key] || 0);
            },
            bakePlaceholderVariable(key) {
                this.bake_placeholder_key = key;
                this.$refs.bake_placeholder_confirm_dialog.showModal();
            },
            changeLoopMode() {
                Emitter.loop_mode = this.loop_mode;
            },
            changeParentMode() {
                Emitter.parent_mode = this.parent_mode;
            },
            toggleCollision() {
                Emitter.ground_collision = !Emitter.ground_collision;
                this.collision = Emitter.ground_collision;
            },
            toggleTrajectoryPath() {
                this.show_path = !this.show_path;
                Trajectory.setShowPath(this.show_path);
            },
            toggleTrajectoryRotation() {
                this.show_rotation = !this.show_rotation;
                Trajectory.setShowRotation(this.show_rotation);
            },
            toggleTrajectoryTexture() {
                this.show_texture_path = !this.show_texture_path;
                Trajectory.setShowTexture(this.show_texture_path);
            },
            toggleShapeGizmo() {
                this.show_shape = !this.show_shape;
                ShapeGizmo.setShow(this.show_shape);
            },
            setTimeOfDay() {
                let color = TIME_PRESETS[this.time_of_day];
                if (color === undefined) {
                    BACKGROUND_COLOR = 0x29323a;
                    localStorage.removeItem('snowstorm_time_of_day');
                } else {
                    BACKGROUND_COLOR = color;
                    localStorage.setItem('snowstorm_time_of_day', this.time_of_day);
                }
                if (View.renderer) View.renderer.setClearColor(new THREE.Color(BACKGROUND_COLOR));
            },
            scrubStart(event) {
                this.scrubTo(event);
                let move = (e) => this.scrubTo(e);
                let up = () => {
                    document.removeEventListener('mousemove', move);
                    document.removeEventListener('mouseup', up);
                };
                document.addEventListener('mousemove', move);
                document.addEventListener('mouseup', up);
            },
            scrubTo(event) {
                let track = this.$refs.timeline;
                if (!track || typeof Emitter.jumpTo !== 'function') return;
                let rect = track.getBoundingClientRect();
                let fraction = Math.clamp((event.clientX - rect.left) / rect.width, 0, 1);
                let span = Emitter.active_time || Emitter.config.emitter_lifetime_active_time || 1;
                Emitter.paused = true;
                Emitter.jumpTo(fraction * span);
                this.playhead = fraction * 100;
            },
            getWarningTitle() {
                return this.warning_count == 1
                    ? '1 Warning'
                    : (this.warning_count + ' Warnings');
            },
            blur() {
                document.activeElement.blur()
            },
            startAnimation,
            togglePause
        },
        computed: {
            particle_counter() {
                let string = this.particles.toString();
                return string.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')
            },
            timestamp() {
                let time = this.stats.time;
                let fractions = Math.floor((time % 1) * 10).toString();
                //if (fractions.length == 1) fractions = '0'+fractions;
                return `${Math.floor(time)}:${fractions}`;
            }
        },
        mounted() {
            initPreview(this.$refs.canvas);
            setInterval(() => {
                this.fps = View.frames_this_second;
                View.frames_this_second = 0;
            }, 1000)
            setInterval(() => {
                this.particles = Emitter.particles.length;
            }, 200)
            setInterval(() => {
                if (window.document.hasFocus() && View.canvas.offsetParent) {
                    this.warning_count = validate().length;
                }
            }, 500)
            EditListeners['placeholder_bar'] = () => {
                if (this.show_placeholder_bar) {
                    updateVariablePlaceholderList(this.placeholder_keys);
                }
            };
            Trajectory.setEmitter(Emitter);
            EditListeners['trajectory'] = () => {
                if (Trajectory.active) Trajectory.update();
            };
            ShapeGizmo.setEmitter(Emitter);
            EditListeners['shape_gizmo'] = () => {
                if (ShapeGizmo.active) ShapeGizmo.update();
            };
            // ---- 3D path editor wiring ----
            PathEditor.setEmitter(Emitter);
            this._raycaster = new THREE.Raycaster();
            this._raycaster.params.Line = { threshold: 0.2 };
            this._dragIndex = -1;
            this._dragPlane = new THREE.Plane();
            this._boundPathMove = this.handlePathMove.bind(this);
            this._boundPathUp = this.handlePathUp.bind(this);
            // [ and ] adjust the thickness of the hovered control point while in path-edit mode.
            this._pathKeydown = (e) => {
                if (!this.path_edit_mode || PathEditor.hovered < 0) return;
                if (e.key === ']') PathEditor.adjustThickness(PathEditor.hovered, 0.1);
                else if (e.key === '[') PathEditor.adjustThickness(PathEditor.hovered, -0.1);
            };
            window.addEventListener('keydown', this._pathKeydown);
            // Keep the timeline playhead in sync with playback.
            setInterval(() => {
                let span = Emitter.active_time || (Emitter.config && Emitter.config.emitter_lifetime_active_time) || 1;
                if (!Emitter.paused && span) {
                    this.playhead = Math.clamp(((Emitter.view_age || 0) % span) / span * 100, 0, 100);
                }
            }, 100);
            View.updateVariablePlaceholderList = () => {
                updateVariablePlaceholderList(this.placeholder_keys);
            }
        },
        beforeDestroy() {
            if (this._pathKeydown) window.removeEventListener('keydown', this._pathKeydown);
            if (this._boundPathMove) document.removeEventListener('pointermove', this._boundPathMove);
            if (this._boundPathUp) document.removeEventListener('pointerup', this._boundPathUp);
        }
    }
    export {View}
</script>

<style scoped>
	main#preview {
		position: relative;
        --footer-height: 34px;
	}
	#canvas_wrapper {
		height: calc(100% - var(--footer-height));
		width: 100%;
	}
	canvas {
		height: 100%;
		width: 100%;
        outline: none;
	}
    #overlay_timestamp {
        top: 0;
        left: 0;
        position: absolute;
        opacity: 0.5;
        padding: 4px 10px;
        font-size: 1.1em;
        font-family: Consolas, monospace;
        pointer-events: none;
    }
    .placeholder_bar {
        position: absolute;
        bottom: 34px;
        min-height: 35px;
        width: 100%;
        display: flex;
        background-color: color-mix(in srgb, var(--color-background) 90%, transparent);
        border-top: 1px solid var(--color-border);
        backdrop-filter: blur(4px);
    }
    .placeholder_bar > ul {
        display: flex;
        padding: 2px 10px;
        gap: 2px 12px;
        flex-grow: 1;
        flex-wrap: wrap;
    }
    .placeholder_bar > ul > li {
        display: flex;
        gap: 5px;
        align-items: center;
    }
    .placeholder_bar > .tool {
        padding-top: 4px;
    }
    .placeholder_bar input {
        width: 70px;
    }
    .placeholder_bar label {
        color: var(--color-text_grayed);
    }
    .placeholder_bar li > .tool {
        width: 24px;
	    padding: 2px;
    }
	footer {
		width: 100%;
		font-size: 1.1em;
        height: var(--footer-height);
        background-color: var(--color-bar);
        border-top: 1px solid var(--color-border);
        display: flex;
        overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
	}	
    footer ::-webkit-scrollbar {
		height: 0px;
	}
	footer > * {
		padding: 4px 8px;
		padding-top: 4px;
        background-color: var(--color-bar);
    }
	footer > .tool {
		padding-top: 2px;
    }
    footer .spacing {
        flex: 1 1 auto;
        padding: 0;
        margin: 0;
    }
    select {
        appearance: none;
        background-color: var(--color-dark);
        border-top: none;
        height: 100%;
        margin-left: 4px;
        padding: 2px 6px;
    }
    #app.portrait_view footer select {
        border-bottom: none;
    }
	div.stat {
        text-align: right;
		float: right;
		background: transparent;
        min-width: 72px;
	}
    div.warning {
        color: #ffc107;
        float: right;
        width: auto;
    }
    div.warning:hover {
        color: #ffe060;
        float: right;
    }
    div.warning > i {
        display: inline;
        margin-right: 4px;
    }
	.unicode_icon.pause {
        margin-top: -4px;
        float: right;
        font-size: 20pt;
        font-weight: bold;
        height: 23px;
        overflow: hidden;
	}
    .tool.toggle_enabled {
        background-color: var(--color-background);
    }
    .timeline_track {
        flex: 1 1 auto;
        align-self: center;
        height: 6px;
        margin: 0 10px;
        min-width: 60px;
        background-color: var(--color-dark);
        border-radius: 3px;
        position: relative;
        cursor: pointer;
        padding: 0;
    }
    .timeline_fill {
        position: absolute;
        left: 0; top: 0; bottom: 0;
        background-color: var(--color-accent, #4fd6ff);
        border-radius: 3px;
        pointer-events: none;
    }
    .timeline_head {
        position: absolute;
        top: 50%;
        width: 11px;
        height: 11px;
        margin-left: -5px;
        transform: translateY(-50%);
        background-color: var(--color-light, #fff);
        border-radius: 50%;
        pointer-events: none;
    }

</style>