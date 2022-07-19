import {
  blobToStr,
  md5,
  romNameScorer,
  settings,
  AppRegistry,
  FetchAppData,
  Resources,
  Unzip,
  UrlUtil,
  WebrcadeApp,
  APP_TYPE_KEYS,
  LOG,
  TEXT_IDS
} from '@webrcade/app-common'
import { Emulator } from './emulator'
import { EmulatorPauseScreen } from './pause';

import './App.scss';

class App extends WebrcadeApp {
  emulator = null;

  componentDidMount() {
    super.componentDidMount();

    const { appProps, ModeEnum } = this;

    // Determine extensions
    // [".smc", ".fig", ".sfc", ".gd3", ".gd7", ".dx2", ".bsx", ".swc"], future...
    const exts =
      AppRegistry.instance.getExtensions(APP_TYPE_KEYS.SNES9X, true, false);
    const extsNotUnique =
      AppRegistry.instance.getExtensions(APP_TYPE_KEYS.SNES9X, true, true);

    try {
      // Get the ROM location that was specified
      const rom = appProps.rom;
      if (!rom) throw new Error("A ROM file was not specified.");
      const pal = appProps.pal !== undefined ? appProps.pal === true : null;

      // Get controller in port #2
      let port2 = 0;
      const port2val = appProps.port2;
      if (port2val) {
        port2 = parseInt(port2val);
      }

      // Create the emulator
      if (this.emulator === null) {
        this.emulator = new Emulator(this, port2, this.isDebug());
      }
      const emulator = this.emulator;

      // Load emscripten and the ROM
      const uz = new Unzip().setDebug(this.isDebug());
      let romBlob = null;
      let romMd5 = null;
      emulator.loadEmscriptenModule()
        .then(() => settings.load())
        // .then(() => settings.setBilinearFilterEnabled(true))
        // .then(() => settings.setVsyncEnabled(false))
        .then(() => new FetchAppData(rom).fetch())
        .then(response => { LOG.info('downloaded.'); return response.blob() })
        .then(blob => uz.unzip(blob, extsNotUnique, exts, romNameScorer))
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
          this.exit(this.isDebug() ? msg : Resources.getText(TEXT_IDS.ERROR_RETRIEVING_GAME));
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

  renderPauseScreen() {
    const { appProps, emulator } = this;

    return (
      <EmulatorPauseScreen
        emulator={emulator}
        appProps={appProps}
        closeCallback={() => this.resume()}
        exitCallback={() => this.exit()}
        isEditor={this.isEditor}
      />
    );
  }

  renderCanvas() {
    return (
      <canvas style={this.getCanvasStyles()} ref={canvas => { this.canvas = canvas; }} id="screen"></canvas>
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
