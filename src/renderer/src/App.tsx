import { Pane, SplitPane } from 'react-split-pane';
import { BottomPanel } from './components/BottomPanel';
import { DialogHost } from './components/Dialog';
import { EditorArea } from './components/EditorArea';
import { Inspector } from './components/Inspector';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { TitleBar } from './components/TitleBar';
import { useShortcuts } from './shortcuts';

export function App() {
  useShortcuts();
  return (
    <div className="app">
      <TitleBar />
      <div className="app-body">
        <SplitPane direction="horizontal">
          <Pane defaultSize="260px" minSize="190px" maxSize="440px">
            <Sidebar />
          </Pane>
          <Pane minSize="360px">
            <SplitPane direction="vertical">
              <Pane minSize="120px">
                <EditorArea />
              </Pane>
              <Pane defaultSize="300px" minSize="110px">
                <BottomPanel />
              </Pane>
            </SplitPane>
          </Pane>
          <Pane defaultSize="400px" minSize="260px" maxSize="720px">
            <Inspector />
          </Pane>
        </SplitPane>
      </div>
      <StatusBar />
      <DialogHost />
    </div>
  );
}
