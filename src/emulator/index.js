import {
  CIDS,
  Controller,
  Controllers,
  DefaultKeyCodeToControlMapping,
  DisplayLoop,
  ScriptAudioProcessor,
  VisibilityChangeMonitor,
  Storage
} from "@webrcade/app-common"

class ButtonMapping {
  constructor(id, joy, cid) {
    this.id = id;
    this.joy = joy;
    this.cid = cid;
    this.down = false;
  }    
}

export class Emulator {
  constructor(app, debug = false) {
    this.controllers = new Controllers([
      new Controller(new DefaultKeyCodeToControlMapping()),
      new Controller()
    ]);

    this.app = app;
    this.xnes = null;
    this.romBytes = null;
    this.romMd5 = null;
    this.romName = null;
    this.pal = null;
    this.saveStatePath = null;

    this.audioChannels = new Array(2);
    this.audioProcessor = null;
    this.displayLoop = null;
    this.visibilityMonitor = null;
    this.started = false;
    this.debug = debug;    
    this.storage = new Storage();
    this.paused = false;

    const bmaps = [];
    this.bmaps = bmaps;
    for(let i = 0; i < 2; i++) {
      const b = i * 12;
      bmaps.push(new ButtonMapping(b+0, i, CIDS.RIGHT));
      bmaps.push(new ButtonMapping(b+1, i, CIDS.LEFT));
      bmaps.push(new ButtonMapping(b+2, i, CIDS.DOWN));
      bmaps.push(new ButtonMapping(b+3, i, CIDS.UP));
      bmaps.push(new ButtonMapping(b+4, i, CIDS.START));
      bmaps.push(new ButtonMapping(b+5, i, CIDS.SELECT));
      bmaps.push(new ButtonMapping(b+6, i, CIDS.B));
      bmaps.push(new ButtonMapping(b+7, i, CIDS.A));
      bmaps.push(new ButtonMapping(b+8, i, CIDS.Y));
      bmaps.push(new ButtonMapping(b+9, i, CIDS.X));
      bmaps.push(new ButtonMapping(b+10, i, CIDS.LBUMP));
      bmaps.push(new ButtonMapping(b+11, i, CIDS.RBUMP));
    }    
    const controllers = this.controllers;
    this.bcheck = map => {
      const down = controllers.isControlDown(map.joy, map.cid);
      if (down !== map.down) {
        window.Module._report_button(map.id, down);
        map.down = down;
      };
    }
  }

  SRAM_FILE = '/rom.srm';

  setRom(pal, name, bytes, md5) {
    if (bytes.byteLength === 0) {
      throw new Error("The size is invalid (0 bytes).");
    }
    this.romName = name;
    this.romMd5 = md5;
    this.romBytes = bytes;
    this.pal = pal;
    if (this.pal === null || this.pal === undefined) {
      this.pal = false;
    }
    console.log('name: ' + this.romName);
    console.log('md5: ' + this.romMd5);
    console.log('pal: ' + this.pal);
  }

  pollControls() {
    const { controllers, app, bmaps, bcheck } = this;
    
    controllers.poll();

    for (let i = 0; i < 2; i++) {
      if (controllers.isControlDown(i, CIDS.ESCAPE)) {
        if (this.pause(true)) {
          controllers.waitUntilControlReleased(i, CIDS.ESCAPE)
            .then(() => controllers.setEnabled(false))
            .then(() => this.saveState())
            .then(() => {
              app.pause(() => {
                controllers.setEnabled(true);
                this.pause(false);
              });
            })
            .catch((e) => console.error(e))
          return;
        }
      }
    }

    bmaps.forEach(bcheck);
  }
                             
  loadEmscriptenModule() {
    const { app } = this;

    window.Module = {
      preRun: [],
      postRun: [],
      onAbort: msg => app.exit(msg),
      onExit: () => app.exit(),
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      document.body.appendChild(script);
      script.src = 'js/snes9x.js';
      script.async = true;
      script.onload = () => {
        console.log('Script loaded.');
        window.initSNES = () => {
          console.log("initSNES.");
          resolve();
        }            
      };
    });
  }

  pause(p) {
    if ((p && !this.paused) || (!p && this.paused)) {
      this.paused = p;
      this.displayLoop.pause(p);
      this.audioProcessor.pause(p);
      return true;
    }
    return false;
  }  

  async saveState() {
    const { started, saveStatePath, storage, SRAM_FILE } = this;
    const { Module, FS } = window;
    if (!started || !saveStatePath) {
      return;
    }
    
    Module._S9xAutoSaveSRAM();    
    const res = FS.analyzePath(SRAM_FILE, true);
    if (res.exists) {
      const s = FS.readFile(SRAM_FILE);              
      if (s) {
        console.log('saving sram.');
        await storage.put(saveStatePath, s);
      }
    }
  }

  async start(canvas) {
    const { romBytes, pal, app, debug, audioChannels, romMd5, storage, SRAM_FILE } = this;
    const { Module, FS } = window;

    if (this.started) return;
    this.started = true;

    console.log('start');

    this.canvas = canvas;
    Module.canvas = canvas;     
    
    // Force PAL if applicable
    if (pal) {
      Module._force_pal(1);
    }

    // Enable debug settings
    if (debug) {
      Module._show_fps(1);
    }

    // Save state path
    this.saveStatePath = app.getStoragePath(`${romMd5}/sav`);

    // Write the save state (if applicable)
    try {
      // Create the save path (MEM FS)
      const res = FS.analyzePath(SRAM_FILE, true);
      if (!res.exists) {
        const s = await storage.get(this.saveStatePath);
        if (s) {
          console.log('writing sram file.');
          FS.writeFile(SRAM_FILE, s);
        }
      }
    } catch (e) {
      // TODO: Proper error handling
      console.error(e);
    }

    // Load the ROM
    const filename = "rom.sfc";
    const u8array = new Uint8Array(romBytes);
    Module.FS_createDataFile("/", filename, u8array, true, true);
    Module.cwrap('run', null, ['string'])(filename);    

    // Determine PAL mode
    const isPal = pal ? true : (Module._is_pal() === 1);

    // Create audio processor
    this.audioProcessor = new ScriptAudioProcessor();
    // Create display loop
    this.displayLoop = new DisplayLoop(isPal ? 50 : 60, true, debug);
    // Visibility monitor
    this.visibilityMonitor = new VisibilityChangeMonitor((p) => {
      if (!app.isPauseScreen()) {
        this.pause(p);
      }
    });
    
    // Audio configuration
    const AUDIO_LENGTH = 8192;
    const samples = 48000 / (isPal ? 50 : 60);
    console.log("Samples: " + samples);

    // Incoming audio channels
    audioChannels[0] = new Float32Array(
      Module.HEAPF32.buffer, Module._get_left_audio_buffer(), AUDIO_LENGTH);
    audioChannels[1] = new Float32Array(
      Module.HEAPF32.buffer, Module._get_right_audio_buffer(), AUDIO_LENGTH);

    // frame step method
    const frame = Module._mainloop;
    // collect audio method
    const collectAudio = Module._collect_audio;

    // Start the audio processor
    this.audioProcessor.start();

    // Start the display loop
    this.displayLoop.start(() => {      
      frame();      
      collectAudio(samples);
      this.audioProcessor.storeSound(audioChannels, samples);
      this.pollControls();
    });
  }
}