import React from 'react';
import CommandResponse from './CommandResponse';
import TreePane from './tree/TreePane';
import SplitPane from 'react-split-pane';
import './console.scss';
import {Layout, Fixed, Flex} from 'react-layout-pane';


const ApplicationId = ({id}) => { return <li className="aid">{id}</li>};






export default ({
    ids,
    log, 
    clearLog,
    repl,
    clearRepl,
    replChange,
    replKeyUp,
    applications}) => {

/*
    var children = Object.values(applications);
    let model = {};
    if (children) {
        console.log(`children ${children}`);
        model = {name: 'root', children: children};
    }
*/

    return (
        <SplitPane split="horizontal" minSize={50} defaultSize={400}>
            <Layout type="row">
                <Fixed className="commands-control">
                    <span className="button" onClick={clearLog}>x</span>
                </Fixed>
                <Flex className="commands">
                    { log.map((result, key) => {
                        return <CommandResponse key={key}
                                                command={result.command}
                                                ok={result.ok}
                                                meaning={result.meaning}
                                                response={result.response} />
                        })
                    }
                </Flex>
            </Layout>
            <Layout type="row">
                <Fixed className="commands-control">
                    <span className="button" onClick={clearRepl}>x</span>
                </Fixed>
                <textarea onChange={replChange} onKeyUp={replKeyUp} >{repl}</textarea>
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
