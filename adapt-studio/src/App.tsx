import { AnalysisScreen } from './components/AnalysisScreen';
import { AnalyzingScreen } from './components/AnalyzingScreen';
import { GeneratingScreen } from './components/GeneratingScreen';
import { Header } from './components/Header';
import { ResultsScreen } from './components/ResultsScreen';
import { SizesScreen } from './components/SizesScreen';
import { UploadScreen } from './components/UploadScreen';
import { ZoomModal } from './components/ZoomModal';
import { useStudio } from './state/useStudio';

export default function App() {
  const { state, allSizes, isSelected, selectedCount, actions } = useStudio();
  const modal = state.modalIdx >= 0 ? state.results[state.modalIdx] : null;
  return (
    <div className="app">
      <Header stage={state.stage} />
      {state.stage === 'upload' && <UploadScreen error={state.uploadError} onFiles={actions.handleFiles} onDemo={actions.loadDemo} />}
      {state.stage === 'analyzing' && <AnalyzingScreen fileName={state.fileName} step={state.anStep} />}
      {state.stage === 'analysis' && state.master && state.model && (
        <AnalysisScreen master={state.master} model={state.model} note={state.analysisNote} hover={state.hover} onHover={actions.setHover} onNext={actions.toSizes} />
      )}
      {state.stage === 'sizes' && state.master && (
        <SizesScreen
          masterRatio={state.master.ratio} sizes={allSizes} isSelected={isSelected} selectedCount={selectedCount}
          onToggle={actions.toggleSize} onAddCustom={actions.addCustomSize} onGenerate={() => void actions.generate()}
        />
      )}
      {state.stage === 'generating' && <GeneratingScreen rows={state.genRows} />}
      {state.stage === 'results' && (
        <ResultsScreen
          results={state.results} overlay={state.overlay}
          onToggleOverlay={actions.toggleOverlay} onDownloadAll={actions.downloadAll} onRestart={actions.restart}
          onOpen={actions.openModal} onDownload={actions.download}
        />
      )}
      {modal && <ZoomModal result={modal} overlay={state.overlay} onClose={actions.closeModal} />}
    </div>
  );
}
