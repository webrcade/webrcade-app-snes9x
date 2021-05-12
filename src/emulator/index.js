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

// const CONTROLS = {
//   INPUT_A: 0x01,
//   INPUT_B: 0x02,
//   INPUT_SELECT: 0x04,
//   INPUT_START: 0x08,
//   INPUT_UP: 0x10,
//   INPUT_DOWN: 0x20,
//   INPUT_LEFT: 0x40,
//   INPUT_RIGHT: 0x80
// }

// const SRAM_NAME = 'rom.sav';

export class Emulator {
  constructor(app, debug = false) {
    this.controllers = new Controllers([
      new Controller(new DefaultKeyCodeToControlMapping()),
      new Controller()
    ]);

    this.app = app;
    this.xnes = null;
    this.romBytes = null;
    this.romName = null;
    this.pal = null;
    // this.saveStatePath = null;

    // this.audioChannels = new Array(1);
    // this.audioProcessor = null;
    // this.displayLoop = null;
    // this.visibilityMonitor = null;
    this.started = false;
    this.debug = debug;    
    this.storage = new Storage();
    this.paused = false;
  }

  // detectPal(filename) {
  //   if (!filename) return false;

  //   const SEARCH = [
  //     "(pal)", "(e)", "(europe)",
  //     "(d)", "(f)", "(g)",
  //     "(gr)", "(i)", "(nl)",
  //     "(no)", "(r)", "(s)",
  //     "(sw)", "(uk)"  
  //   ];

  //   filename = filename.toLowerCase();
  //   for (const s of SEARCH) {
  //     if (filename.indexOf(s) !== -1) {
  //       return true;
  //     }
  //   }

  //   return false;
  // }

  setRom(pal, name, bytes) {
    if (bytes.byteLength === 0) {
      throw new Error("The size is invalid (0 bytes).");
    }
    this.romName = name;
    this.romBytes = bytes;
    this.pal = pal;
    if (this.pal === null || this.pal === undefined) {
      // this.pal = this.detectPal(name);
      this.pal = false;
    }
    console.log('name: ' + this.romName);
    console.log('pal: ' + this.pal);
  }

  pollControls() {
  //   const { controllers, fceux, app } = this;

  //   controllers.poll();
    
  //   let bits = 0;
  //   for (let i = 0; i < 2; i++) {      
  //     let input = 0;

  //     if (controllers.isControlDown(i, CIDS.ESCAPE)) {
  //       if (this.pause(true)) {
  //         controllers.waitUntilControlReleased(i, CIDS.ESCAPE)
  //           .then(() => controllers.setEnabled(false))
  //           .then(() => this.saveState())
  //           .then(() => { app.pause(() => { 
  //               controllers.setEnabled(true);
  //               this.pause(false);                 
  //             }); 
  //           })
  //           .catch((e) => console.error(e))
  //         return;
  //       }
  //     }

  //     if (controllers.isControlDown(i, CIDS.UP)) {
  //       input |= CONTROLS.INPUT_UP;
  //     }
  //     else if (controllers.isControlDown(i, CIDS.DOWN)) {
  //       input |= CONTROLS.INPUT_DOWN;
  //     }
  //     if (controllers.isControlDown(i, CIDS.RIGHT)) {
  //       input |= CONTROLS.INPUT_RIGHT;
  //     }
  //     else if (controllers.isControlDown(i, CIDS.LEFT)) {
  //       input |= CONTROLS.INPUT_LEFT;
  //     }
  //     if (controllers.isControlDown(i, CIDS.B) || controllers.isControlDown(i, CIDS.X) ) {
  //       input |= CONTROLS.INPUT_A;
  //     }
  //     if (controllers.isControlDown(i, CIDS.A) || controllers.isControlDown(i, CIDS.Y)) {
  //       input |= CONTROLS.INPUT_B;
  //     }
  //     if (controllers.isControlDown(i, CIDS.SELECT)) {
  //       input |= CONTROLS.INPUT_SELECT;
  //     }
  //     if (controllers.isControlDown(i, CIDS.START)) {
  //       input |= CONTROLS.INPUT_START;
  //     }
  //     bits |= input << (i<<3);
  //   }
  //   fceux.setControllerBits(bits);
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
      // this.displayLoop.pause(p);
      // this.audioProcessor.pause(p);
      return true;
    }
    return false;
  }  

  // async saveState() {
  //   const { fceux, started, saveStatePath, storage } = this;
  //   if (!started) {
  //     return;
  //   }

  //   const result = fceux.exportSaveFiles();
  //   if (saveStatePath && result !== undefined && 
  //     result[SRAM_NAME] !== undefined) {
  //     const sram = result[SRAM_NAME];
  //     if (sram.length === 0) {
  //       return;
  //     }
  //     console.log('saving sram.');
  //     await storage.put(saveStatePath, sram);
  //   }
  // }

  async start(canvas) {
    const { romBytes, pal, app, debug, storage } = this;
    const { Module } = window;

    if (this.started) return;
    this.started = true;

    console.log('start');

    this.canvas = canvas;
    Module.canvas = canvas;        

    const filename = "rom.sfc";
    const u8array = new Uint8Array(romBytes);
    Module.FS_createDataFile("/", filename, u8array, true, true);
    const run = Module.cwrap('run', null, ['string']);
    run(filename);

    this.displayLoop = new DisplayLoop(pal ? 50 : 60, true, debug);

    this.visibilityMonitor = new VisibilityChangeMonitor((p) => {
      if (!app.isPauseScreen()) {
        this.pause(p);
      }
    });

    const queueNewAudio = window.SDL.audio.queueNewAudioData;
    const syncSound = Module.cwrap('sync_sound', 'int', ['string']);

    // game loop
    const frame = Module.cwrap('mainloop', null, []);
    this.displayLoop.start(() => {
      queueNewAudio();
      frame();      
      this.pollControls();
    });
  }
}
