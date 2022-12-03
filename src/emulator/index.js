import {
  AppWrapper,
  Controller,
  Controllers,
  DefaultKeyCodeToControlMapping,
  DisplayLoop,
  CIDS,
  LOG,
} from '@webrcade/app-common';

class ButtonMapping {
  constructor(id, joy, cid) {
    this.id = id;
    this.joy = joy;
    this.cid = cid;
    this.down = false;
  }
}

const STATE_FILE_PATH = "/freeze.out"

export class Emulator extends AppWrapper {
  constructor(app, port2, debug = false) {
    super(app, debug);

    this.port2 = port2;
    this.xnes = null;
    this.romBytes = null;
    this.romMd5 = null;
    this.romName = null;
    this.pal = null;
    this.saveStatePrefix = null;
    this.saveStatePath = null;
    this.audioChannels = new Array(2);
    this.controllerCount = 2;

    if (port2 === 1) {
      this.controllerCount = 5;
      this.controllers = new Controllers([
        new Controller(new DefaultKeyCodeToControlMapping()),
        new Controller(),
        new Controller(),
        new Controller(),
        new Controller(),
      ]);
    }

    const bmaps = [];
    this.bmaps = bmaps;
    for (let i = 0; i < this.controllerCount; i++) {
      const b = i * 12;
      bmaps.push(new ButtonMapping(b + 0, i, CIDS.RIGHT));
      bmaps.push(new ButtonMapping(b + 1, i, CIDS.LEFT));
      bmaps.push(new ButtonMapping(b + 2, i, CIDS.DOWN));
      bmaps.push(new ButtonMapping(b + 3, i, CIDS.UP));
      bmaps.push(new ButtonMapping(b + 4, i, CIDS.START));
      bmaps.push(new ButtonMapping(b + 5, i, CIDS.SELECT));
      bmaps.push(new ButtonMapping(b + 6, i, CIDS.B));
      bmaps.push(new ButtonMapping(b + 7, i, CIDS.A));
      bmaps.push(new ButtonMapping(b + 8, i, CIDS.Y));
      bmaps.push(new ButtonMapping(b + 9, i, CIDS.X));
      bmaps.push(new ButtonMapping(b + 10, i, CIDS.LBUMP));
      bmaps.push(new ButtonMapping(b + 11, i, CIDS.RBUMP));
    }
    const controllers = this.controllers;
    this.bcheck = (map) => {
      const down = controllers.isControlDown(map.joy, map.cid);
      if (down !== map.down) {
        window.Module._report_button(map.id, down);
        map.down = down;
      }
    };
  }

  SRAM_FILE = '/rom.srm';
  SAVE_NAME = 'sav';

  setRom(pal, name, bytes, md5) {
    if (bytes.byteLength === 0) {
      throw new Error('The size is invalid (0 bytes).');
    }
    this.romName = name;
    this.romMd5 = md5;
    this.romBytes = bytes;
    this.pal = pal;
    if (this.pal === null || this.pal === undefined) {
      this.pal = false;
    }
    LOG.info('name: ' + this.romName);
    LOG.info('md5: ' + this.romMd5);
    LOG.info('pal: ' + this.pal);
  }

  async onShowPauseMenu() {
    await this.saveState();
  }

  pollControls() {
    const { controllers, bmaps, bcheck } = this;

    controllers.poll();

    for (let i = 0; i < 2; i++) {
      if (controllers.isControlDown(i, CIDS.ESCAPE)) {
        if (this.pause(true)) {
          controllers
            .waitUntilControlReleased(i, CIDS.ESCAPE)
            .then(() => this.showPauseMenu());
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
      onAbort: (msg) => app.exit(msg),
      onExit: () => app.exit(),
    };

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      document.body.appendChild(script);

      // TODO: Remove this hack once the LOTR and Axelay
      // issue is resolved. Chrome bug?
      const nav = navigator.userAgent.toLowerCase();
      // Is chrome and not mobile
      const useHack =
        nav.indexOf('chrome') !== -1 && nav.indexOf('mobile') === -1;

      script.src = useHack ? 'js/snes9x-chrome-intel.js' : 'js/snes9x.js';
      script.async = true;
      script.onload = () => {
        LOG.info('Script loaded.');
        window.initSNES = () => {
          LOG.info('initSNES.');
          resolve();
        };
      };
    });
  }

  async migrateSaves() {
    const { saveStatePath, storage, SAVE_NAME } = this;

    // Load old saves (if applicable)
    const sram = await storage.get(saveStatePath);
    if (sram) {
      LOG.info('Migrating local saves.');

      await this.getSaveManager().saveLocal(saveStatePath, [
        {
          name: SAVE_NAME,
          content: sram,
        },
      ]);

      // Delete old location (and info)
      await storage.remove(saveStatePath);
      await storage.remove(`${saveStatePath}/info`);
    }
  }

  async loadState() {
    const { saveStatePath, SAVE_NAME, SRAM_FILE } = this;
    const { FS } = window;

    // Write the save state (if applicable)
    try {
      // Migrate old save format
      await this.migrateSaves();

      // Create the save path (MEM FS)
      const res = FS.analyzePath(SRAM_FILE, true);
      if (!res.exists) {
        // Load from new save format
        const files = await this.getSaveManager().load(
          saveStatePath,
          this.loadMessageCallback,
        );

        if (files) {
          for (let i = 0; i < files.length; i++) {
            const f = files[i];
            if (f.name === SAVE_NAME) {
              LOG.info('writing sram file.');
              FS.writeFile(SRAM_FILE, f.content);
              break;
            }
          }

          // Cache the initial files
          await this.getSaveManager().checkFilesChanged(files);
        }
      }
    } catch (e) {
      LOG.error('Error loading save state: ' + e);
    }
  }

  async saveInOldFormat(s) {
    const { saveStatePath } = this;
    // old, for testing migration
    await this.saveStateToStorage(saveStatePath, s);
  }

  async saveState() {
    const { saveStatePath, started, SAVE_NAME, SRAM_FILE } = this;
    const { Module, FS } = window;

    try {
      if (!started || !saveStatePath) {
        return;
      }

      Module._S9xAutoSaveSRAM();
      const res = FS.analyzePath(SRAM_FILE, true);
      if (res.exists) {
        const s = FS.readFile(SRAM_FILE);
        if (s) {
          LOG.info('saving sram.');

          const files = [
            {
              name: SAVE_NAME,
              content: s,
            },
          ];

          // Cache the initial files
          if (await this.getSaveManager().checkFilesChanged(files)) {
            //await this.saveInOldFormat(s);
            await this.getSaveManager().save(
              saveStatePath,
              files,
              this.saveMessageCallback,
            );
          }
        }
      }
    } catch (e) {
      LOG.error('Error persisting save state: ' + e);
    }
  }

  async getStateSlots(showStatus = true) {
    return await this.getSaveManager().getStateSlots(
      this.saveStatePrefix, showStatus ? this.saveMessageCallback : null
    );
  }

  async saveStateForSlot(slot) {
    const { Module, FS } = window;

    Module._freeze();

    let s = null;
    try {
      try {
        s = FS.readFile(STATE_FILE_PATH);
      } catch (e) { console.log(e) }

      if (s) {
        await this.getSaveManager().saveState(
          this.saveStatePrefix, slot, s,
          this.canvas,
          this.saveMessageCallback);
      }
    } catch (e) {
      LOG.error('Error saving state: ' + e);
    }

    return true;
  }

  async loadStateForSlot(slot) {
    const { Module, FS } = window;

    try {
      const state = await this.getSaveManager().loadState(
        this.saveStatePrefix, slot, this.saveMessageCallback);

      if (state) {
        FS.writeFile(STATE_FILE_PATH, state);
        Module._unfreeze();
      }
    } catch (e) {
      LOG.error('Error loading state: ' + e);
    }
    return true;
  }

  async deleteStateForSlot(slot, showStatus = true) {
    try {
      await this.getSaveManager().deleteState(
        this.saveStatePrefix, slot, showStatus ? this.saveMessageCallback : null);
    } catch (e) {
      LOG.error('Error deleting state: ' + e);
    }
    return true;
  }

  async onStart(canvas) {
    const { app, audioChannels, debug, pal, romBytes, romMd5, SAVE_NAME } =
      this;
    const { Module } = window;

    // Set the canvas for the module
    Module.canvas = canvas;

    // Force PAL if applicable
    if (pal) {
      Module._force_pal(1);
    }

    // Enable debug settings
    if (debug) {
      Module._show_fps(1);
    }

    // Disable Emscripten capturing events
    window.SDL.receiveEvent = (event) => {};

    // Load save state
    this.saveStatePrefix = app.getStoragePath(`${romMd5}/`);
    this.saveStatePath = `${this.saveStatePrefix}${SAVE_NAME}`;
    await this.loadState();

    // Load the ROM
    const filename = 'rom.sfc';
    const u8array = new Uint8Array(romBytes);
    Module.FS_createDataFile('/', filename, u8array, true, true);
    Module.cwrap('run', null, ['string', 'int'])(filename, this.port2);

    // Determine PAL mode
    const isPal = pal ? true : Module._is_pal() === 1;

    // Create display loop
    this.displayLoop = new DisplayLoop(isPal ? 50 : 60, true, debug);

    // Audio configuration
    const AUDIO_LENGTH = 8192;
    const samples = 48000 / (isPal ? 50 : 60);
    LOG.info('Samples: ' + samples);

    // Incoming audio channels
    audioChannels[0] = new Float32Array(
      Module.HEAPF32.buffer,
      Module._get_left_audio_buffer(),
      AUDIO_LENGTH,
    );
    audioChannels[1] = new Float32Array(
      Module.HEAPF32.buffer,
      Module._get_right_audio_buffer(),
      AUDIO_LENGTH,
    );

    // frame step method
    const frame = Module._mainloop;
    // collect audio method
    const collectAudio = Module._collect_audio;

    // Start the audio processor
    this.audioProcessor.start();

    // Enable showing messages
    this.setShowMessageEnabled(true);

    // Start the display loop
    this.displayLoop.start(() => {
      frame();
      collectAudio(samples);
      this.audioProcessor.storeSound(audioChannels, samples);
      this.pollControls();
    });
  }
}
