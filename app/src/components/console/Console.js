import React from 'react';
import ConsoleEntry from '../console-entry/ConsoleEntry';
import ScrollToBottom from '../scroll-to-bottom/ScrollToBottom';
import SplitPane from 'react-split-pane';
import {Layout, Fixed} from 'react-layout-pane';
import './console.scss';

import EmvTags from '../../EmvTags';


export default ({
    log,
    interrogate,
    clearLog,
    repl,
    clearRepl,
    replChange,
    replKeyUp,
    replRun,
    applications}) => {


    const renderEntries = () => {
        return log.map((result, key) => {
            console.log(`result ${JSON.stringify(result)}`);
            if (result.type && result.type === 'card-inserted') {
                return <CardInserted key={key} device={result.device} atr={result.atr} />;
            }
            return <ConsoleEntry key={key}
                                 command={result.command}
                                 ok={result.ok}
                                 meaning={result.meaning}
                                 response={result.response} />
        })
    };

    return (
        <SplitPane className="console" split="horizontal" minSize={50} defaultSize={600}>
            <Layout type="row">
                <Fixed className="sidebar-control">
                    <div title="Interrogate Card" className="button fa fa-play-circle" onClick={interrogate}></div>
                    <div title="Clear Console Log" className="button fa fa-trash" onClick={clearLog}></div>
                </Fixed>
                <ScrollToBottom className="commands">
                    {
                        renderEntries()
                    }
                </ScrollToBottom>
            </Layout>
            <Layout type="row">
                <Fixed className="sidebar-control">
                    <div title="Issue Command" className="button fa fa-play-circle" onClick={replRun}></div>
                    <div title="Clear" className="button fa fa-trash" onClick={clearRepl}></div>
                </Fixed>
                <textarea onChange={replChange} onKeyUp={replKeyUp} value={repl} />
            </Layout>
        </SplitPane>

    )
};


const CardInserted = ({device, atr}) => {
    return (
        <div className={`card-inserted`} >
            <div className={`device`}>{device}</div>
            <div className={`atr`}>{atr}</div>
        </div>
    )
};