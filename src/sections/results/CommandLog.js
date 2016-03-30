import React from 'react';
import CommandResponse from './CommandResponse';
import TreePane from './tree/TreePane';
import SplitPane from 'react-split-pane';
import './command-log.scss';
import {Layout, Fixed, Flex} from 'react-layout-pane';


const ApplicationId = ({id}) => { return <li className="aid">{id}</li>};






export default ({commands, ids, clear, applications}) => {

     var children = Object.values(applications);
    // //console.log(`children ${children} ${Object.keys(children)} ${Object.values(applications)} ${Object.keys(applications)} ${applications[children]}`);
    //
    let model = {};
    if (children) {
        console.log(`children ${children}`);

        model = {name: 'root', children: children};
    }

    return (
        <SplitPane split="vertical" minSize={50} defaultSize={400}>
            <Layout type="row">
                <Fixed className="commands-control">
                    <span className="button" onClick={clear}>x</span>
                </Fixed>
                <Flex className="commands">
                    { commands.map((result, key) => {
                        return <CommandResponse key={key}
                                                command={result.command}
                                                ok={result.ok}
                                                meaning={result.meaning}
                                                response={result.response} />
                        })
                    }
                </Flex>
            </Layout>
            <div>
            <TreePane model={model} />
            </div>
        </SplitPane>

    )
};


/*
<ul className="aids">
    {ids.map((id, key) => <ApplicationId id={id} key={key} />)}
</ul>
*/
