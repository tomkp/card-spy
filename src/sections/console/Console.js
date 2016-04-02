import React from 'react';
import CommandResponse from './CommandResponse';
import ScrollToBottom from './ScrollToBottom';
import TreePane from './tree/TreePane';
import SplitPane from 'react-split-pane';
import './console.scss';
import {Layout, Fixed, Flex} from 'react-layout-pane';


const ApplicationId = ({id}) => { return <li className="aid">{id}</li>};




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

/*
    var children = Object.values(applications);
    let model = {};
    if (children) {
        console.log(`children ${children}`);
        model = {name: 'root', children: children};
    }
*/

    //console.log(`${repl}`);

    return (
        <SplitPane split="horizontal" minSize={50} defaultSize={400}>
            <Layout type="row">
                <Fixed className="commands-control">
                    <div className="button" onClick={clearLog}>x</div>
                    <div className="button" onClick={interrogate}>&gt;</div>
                </Fixed>
                <ScrollToBottom className="commands">
                    { log.map((result, key) => {
                        return <CommandResponse key={key}
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


/*
 <TreePane model={model} />
<ul className="aids">
    {ids.map((id, key) => <ApplicationId id={id} key={key} />)}
</ul>
*/
