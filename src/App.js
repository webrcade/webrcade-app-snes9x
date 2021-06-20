import {
  blobToStr,
  md5,  
  FetchAppData, 
  Resources, 
  Unzip, 
  UrlUtil, 
  WebrcadeApp, 
  LOG,
  TEXT_IDS 
} from '@webrcade/app-common'
import { Emulator } from './emulator'

import './App.scss';

class App extends WebrcadeApp {
  emulator = null;

  componentDidMount() {
    super.componentDidMount();

    // Create the emulator
    if (this.emulator === null) {
      this.emulator = new Emulator(this, this.isDebug());
    }

    const { appProps, emulator, ModeEnum } = this;

    try {
      // Get the ROM location that was specified
      const rom = appProps.rom;
      if (!rom) throw new Error("A ROM file was not specified.");
      const pal = appProps.pal !== undefined ? appProps.pal === true : null;

      // Load emscripten and the ROM
      const uz = new Unzip();
      let romBlob = null;
      let romMd5 = null;
      emulator.loadEmscriptenModule()
        .then(() => new FetchAppData(rom).fetch())
        .then(response => { LOG.info('downloaded.'); return response.blob() })
        .then(blob => uz.unzip(blob, [".smc", ".fig", ".sfc", ".gd3", ".gd7", ".dx2", ".bsx", ".swc"]))
        .then(blob => { romBlob = blob; return blob; })
        .then(blob => blobToStr(blob))
        .then(str => { romMd5 = md5(str); })
        .then(() => new Response(romBlob).arrayBuffer())
        .then(bytes => emulator.setRom(
          pal,
          uz.getName() ? uz.getName() : UrlUtil.getFileName(rom),
          bytes,
          romMd5))
        .then(() => this.setState({ mode: ModeEnum.LOADED }))
        .catch(msg => {
          LOG.error(msg);
          this.exit(Resources.getText(TEXT_IDS.ERROR_RETRIEVING_GAME));
        })
    } catch (e) {
      this.exit(e);
    }
  }

  async onPreExit() {
    try {
      await super.onPreExit();
      await this.emulator.saveState();
    } catch (e) {
      LOG.error(e);
    }
  }

  componentDidUpdate() {
    const { mode } = this.state;
    const { canvas, emulator, ModeEnum } = this;

    if (mode === ModeEnum.LOADED) {
      window.focus();
      // Start the emulator
      emulator.start(canvas);
    }
  }

  renderCanvas() {
    return (
      <canvas ref={canvas => { this.canvas = canvas; }} id="screen"></canvas>
    );
  }

  render() {
    const { mode } = this.state;
    const { ModeEnum } = this;

    return (
      <>
        { super.render()}
        { mode === ModeEnum.LOADING ? this.renderLoading() : null}
        { mode === ModeEnum.PAUSE ? this.renderPauseScreen() : null}        
        { mode === ModeEnum.LOADED || mode === ModeEnum.PAUSE  ? this.renderCanvas() : null}
      </>
    );
  }
}

export default App;
