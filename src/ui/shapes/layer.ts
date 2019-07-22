import * as tf from '@tensorflow/tfjs';
import { Draggable } from "./draggable";
import { Point, Shape } from "./shape";
import { Activation } from "./activation";
import { Wire } from "./wire";
import * as d3 from "d3";
import { windowProperties } from "../window";
import { topologicalSort, generateTfjsModel} from '../../model/build_network';
import { displayError } from '../error';
import { parseString } from '../utils';
import { svgData } from '../app';
import { changeDataset } from '../../model/data';

export interface LayerJson {
    layer_name: string
    id: number
    children_ids: Array<number>
    parent_ids: Array<number>
    params: any
    xPosition: number
    yPosition: number
}

// TODO params for entering things in UI for layer properties

export abstract class Layer extends Draggable {
    layerType: string = ""; // TODO change this
    parameterDefaults;
    protected tfjsLayer: tf.SymbolicTensor;
    protected readonly tfjsEmptyLayer;
    paramBox: HTMLElement;
    selectText: any = d3.select("body")
                        .append("div")
                        .style("position", "absolute")
                        .style("padding", "6px")
                        .style("background", "rgba(0, 0, 0, 0.8)")
                        .style("color", "#eee")
                        .style("border-radius", "2px")
                        .style("display", "none")
                        .style("font-family", "Helvetica")
                        .style("user-select","none")
    shape: number[];  // The shape/dimensions of the layer.

    block: Array<Shape>;
    children: Set<Layer> = new Set();
    parents: Set<Layer> = new Set();
    wires: Set<Wire> = new Set();

    readonly outputWiresAllowed: boolean = true;
    readonly wireGuidePresent: boolean = true;

    private static nextID: number = 0;
    uid: number;
    abstract lineOfPython(): string;
    abstract getHoverText(): string;
    abstract clone(): Layer;

    constructor(block: Array<Shape>, defaultLocation) {
        super(defaultLocation);
        this.uid = Layer.nextID;
        Layer.nextID += 1;
        this.block = block;



        for (let rect of this.block) {
            this.svgComponent.call(rect.svgAppender.bind(rect));
        }

        this.paramBox = document.createElement('div');
        this.paramBox.className = 'parambox';
        this.paramBox.style.visibility = 'hidden';
        this.paramBox.style.position = 'absolute';
        document.getElementById("paramtruck").appendChild(this.paramBox);

        // function SVGToScreen(svg, svgX, svgY) {
        //     let p = svg.createSVGPoint()
        //      p.x = svgX
        //      p.y = svgY
        //      return p.matrixTransform(svg.getScreenCTM());
        // }
        // console.log("THIS IS", SVGToScreen(document.getElementById("svg"), this.getPosition().x, this.getPosition().y))

        // let p = SVGToScreen(document.getElementById("svg"), this.getPosition().x, this.getPosition().y)
        this.svgComponent.on("click", () => {
                             this.select()
                             window.clearTimeout(this.moveTimeout)
                             this.hoverText.style("visibility", "hidden")

                            

                            //  this.selectText.style("display", null);
                            //  this.selectText.style("top", (d3.event.pageY+"px")).style("left",(d3.event.pageX+"px"));
                            //  this.selectText.style("visibility", "visible");
                            //  console.log(this.selectText)
                            //  this.selectText.text("[" + this.layerShape().toString() + "]");
                            //  console.log(this.layerShape().toString())
                            })
        this.populateParamBox()
    }

    public static getNextID(){
        let id = Layer.nextID;
        Layer.nextID += 1;
        return id;
    }

    populateParamBox() {}

    public moveAction() {
        for (let wire of this.wires) {
            wire.updatePosition()
        }
        
        if (windowProperties.selectedElement === this) {
            windowProperties.shapeTextBox.setPosition(this.getPosition());
        }        
    }

    public raise() {
        this.wires.forEach(w => w.raiseGroup());
        this.parents.forEach(p => p.raiseGroup());
        this.children.forEach(c => c.raiseGroup());
        this.raiseGroup();
    }

    public select() {
        let currSelected = windowProperties.selectedElement;
        if (currSelected != null && currSelected !== this && currSelected instanceof Layer && currSelected.outputWiresAllowed) {
            currSelected.addChild(this)
        }
        super.select()
        document.getElementById("defaultparambox").style.display = "none"
        this.paramBox.style.visibility = 'visible'
        this.svgComponent.selectAll("path").style("stroke", "yellow").style("stroke-width", "2")
        this.svgComponent.selectAll(".outerShape").style("stroke", "yellow").style("stroke-width", "2")

        let bbox = this.outerBoundingBox();
        windowProperties.shapeTextBox.setOffset(new Point((bbox.left+bbox.right)/2, bbox.bottom+25));
        windowProperties.shapeTextBox.setText("[" + this.layerShape().toString() + "]");
        windowProperties.shapeTextBox.setPosition(this.getPosition());
        windowProperties.shapeTextBox.show();
    }

    public unselect() {
        super.unselect()
        document.getElementById("defaultparambox").style.display = null
        this.paramBox.style.visibility = 'hidden'
        this.svgComponent.selectAll("path").style("stroke", null).style("stroke-width", null)
        this.svgComponent.selectAll(".outerShape").style("stroke", null).style("stroke-width", null)
        this.selectText.style("visibility", "hidden");
        windowProperties.shapeTextBox.hide();
        
    }

    /**
     * Add a child layer of this node (successor).
     * @param child the layer pointed to by the given wire
     */
    public addChild(child: Layer) {
        if (!this.children.has(child) && !child.children.has(this)) {
            this.children.add(child)
            child.parents.add(this)

            let newWire = new Wire(this, child)
            this.wires.add(newWire)
            child.wires.add(newWire)

        }
    }

    /**
     * Add a parent layer of this node (predecessor).
     * @param parent the layer pointed to by the given wire
     */
    public addParent(parent: Layer) {
        parent.addChild(this)
    }

    public delete() {
        super.delete()
        this.wires.forEach((w) => w.delete()) // deleting wires should delete layer connection sets
    }

    public toJson(): LayerJson {
        return {
            "layer_name": this.layerType,
            "children_ids": Array.from(this.children, child => child.uid),
            "parent_ids": Array.from(this.parents, parent => parent.uid),
            "params": this.getJSONParams(),
            "id": this.uid,
            "xPosition": this.getPosition().x,
            "yPosition": this.getPosition().y,
        }
    }

    public getJSONParams() {
        let params = {}
        let defaultParams = this.parameterDefaults;
        for(let line of this.paramBox.children){
            let name = line.children[0].getAttribute('data-name');
            if (line.children[1].className == "select") {
                let selectElement: HTMLSelectElement = <HTMLSelectElement>line.children[1].children[0];
                params[name] = selectElement.options[selectElement.selectedIndex].value
            } else {
                let value = (<HTMLInputElement>line.children[1]).value;
                // Need to not parse as integer for float parameters
                if ((defaultParams[name].toString()).indexOf('.') >= 0) {
                    params[name] = parseFloat(value);
                }

                else {
                    params[name] = parseString(value);  
                }
            }
        }
        return params
    }
    
    public getParams(): { [dataset: string]: any; } {
        let params = {}
        let defaultParams = this.parameterDefaults;
        for(let line of this.paramBox.children){
            let name = line.children[0].getAttribute('data-name');
            if (line.children[1].className == "select") {
                let selectElement: HTMLSelectElement = <HTMLSelectElement>line.children[1].children[0];
                params[name] = selectElement.options[selectElement.selectedIndex].value
            } else {
                let value = (<HTMLInputElement>line.children[1]).value;
                // Need to not parse as integer for float parameters
                if ((defaultParams[name].toString()).indexOf('.') >= 0) {
                    params[name] = parseFloat(value);
                }

                else {
                    params[name] = parseString(value);  
                }
            }
        }
        return params
    }

    public setParams(params: Map<string, any>): void {
        for(let line of this.paramBox.children){
            let name = line.children[0].getAttribute('data-name');
            if (line.children[1].className == "select") {
                let selectElement: HTMLSelectElement = <HTMLSelectElement>line.children[1].children[0];
                // Get index with the correct value and select it
                selectElement.selectedIndex = Array.apply(null, selectElement).findIndex(elem => elem.value === params[name])
            } else {
                (<HTMLInputElement>line.children[1]).value = params[name];
            }
        }
    }

    public focusing() {
        for(let line of this.paramBox.children){
            (<HTMLInputElement>line.children[1]).onfocus = this.toggleFocus.bind(line.children[1]);
            (<HTMLInputElement>line.children[1]).onblur = this.toggleFocus.bind(line.children[1]);
        }
    }

    public toggleFocus(textField) {
        textField.target.classList.toggle("focusParam");
    }
    /**
     * Make parent -> this become parent -> layer -> this.
     * @param layer a layer that will become the new parent
     * @param parent a parent of this
     */
    public addParentLayerBetween(layer: Layer, parent: Layer) {
        parent.children.delete(this)
        parent.children.add(layer)

        layer.parents.add(parent)
        layer.children.add(this)

        this.parents.delete(parent)
        this.parents.add(layer)
    }


    /**
     * Make parents -> this become parents -> layer -> this.
     * @param parent a parent of this
     */
    public addParentLayer(layer: Layer) {
        for (let parent of this.parents) {
            parent.children.delete(this)
            parent.children.add(layer)
        }

        layer.parents = new Set([...layer.parents, ...this.parents])
        layer.children.add(this)

        this.parents.clear()
        this.parents.add(layer)
    }

    /**
     * Make new child -> this become this -> newChild -> old children.
     * @param newChild a new child of this
     */
    public addChildLayerBetween(newChild: Layer){
        for (let child of this.children){
            newChild.addChild(child)
            child.parents.delete(this)
        }
        this.children.clear()
        this.addChild(newChild)
        newChild.addParent(this)
    }

    public getTfjsLayer(){
        return this.tfjsLayer
    }

    public generateTfjsLayer(){
        // TODO change defaults to class level
        let parameters = this.getParams()

        let parent:Layer = null
        for (let p of this.parents){ parent = p; break }
        // Concatenate layers handle fan-in

        if (this.parents.size > 1) {
            displayError(new Error("Must use a concatenate when a layer has multiple parents"));
        }

        this.tfjsLayer = this.tfjsEmptyLayer(parameters).apply(parent.getTfjsLayer())
    }

    public layerShape(): number[]{
        // Computes all of the predecessors to determine shape
        if (this.layerType == "Input") {
            changeDataset(svgData.input.getParams()["dataset"])
        }
        try {
            generateTfjsModel(topologicalSort(svgData.input, false))
            return this.getTfjsLayer().shape;
        } catch(err){  // Hide errors while building the network
            return null
        }
    }

    public initLineOfJulia(): string {
        return '';
    }

    public lineOfJulia(): string {
        let connections = ''
        for (let child of this.children){
            connections += `connect!(net, x${this.uid}, x${child.uid})\n`
        }
        return connections
    }

    public hasParentType(type){
        for (let p of this.parents){
            if (p instanceof type){
                return true;
            }
        }

        return false;
    }

}
