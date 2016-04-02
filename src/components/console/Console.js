import React from 'react';
import ConsoleEntry from '../console-entry/ConsoleEntry';
import ScrollToBottom from '../scroll-to-bottom/ScrollToBottom';
import SplitPane from 'react-split-pane';
import {Layout, Fixed} from 'react-layout-pane';
import './console.scss';



export default ({
    ids,
    log,
    interrogate,
    clearLog,
    repl,
    clearRepl,
    replChange,
    replKeyUp,
    replRun,
    applications}) => {


    return (
        <SplitPane split="horizontal" minSize={50} defaultSize={500}>
            <Layout type="row">
                <Fixed className="commands-control">
                    <div title="Interrogate Card" className="button" onClick={interrogate}>&gt;</div>
                    <div title="Clear Console Log" className="button" onClick={clearLog}>x</div>
                </Fixed>
                <ScrollToBottom className="commands">
                    { log.map((result, key) => {
                        return <ConsoleEntry key={key}
                                                command={result.command}
                                                ok={result.ok}
                                                meaning={result.meaning}
                                                response={result.response} />
                        })
                    }
                </ScrollToBottom>
            </Layout>
            <Layout type="row">
                <Fixed className="commands-control">
                    <div title="Issue Command" className="button" onClick={replRun}>&gt;</div>
                    <div title="Clear" className="button" onClick={clearRepl}>x</div>
                </Fixed>
                <textarea onChange={replChange} onKeyUp={replKeyUp} value={repl} />
            </Layout>
        </SplitPane>

    )
};
