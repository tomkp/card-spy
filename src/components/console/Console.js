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
                    <div className="button" onClick={clearLog}>x</div>
                    <div className="button" onClick={interrogate}>&gt;</div>
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
                    <div className="button" onClick={clearRepl}>x</div>
                    <div className="button" onClick={replRun}>&gt;</div>
                </Fixed>
                <textarea onChange={replChange} onKeyUp={replKeyUp} value={repl} />
            </Layout>
        </SplitPane>

    )
};
