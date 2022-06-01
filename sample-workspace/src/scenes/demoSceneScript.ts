import { KeyboardEventTypes, KeyboardInfo, Mesh, Nullable, Scene } from "@babylonjs/core";
import { Node } from "@babylonjs/core/node";
import { fromScene, onKeyboardEvent, visibleInInspector } from "./decorators";
import SumerianHost from "./sumerianhost";
import * as AWS from 'aws-sdk';
import { aws as AwsFeatures } from '@amazon-sumerian-hosts/babylon';
import { showUiScreen } from './domUtils';
import IAwsConnector from "./IAwsConnector";

/**
 * This represents a script that is attached to a node in the editor.
 * Available nodes are:
 *      - Meshes
 *      - Lights
 *      - Cameas
 *      - Transform nodes
 * 
 * You can extend the desired class according to the node type.
 * Example:
 *      export default class MyMesh extends Mesh {
 *          public onUpdate(): void {
 *              this.rotation.y += 0.04;
 *          }
 *      }
 * The function "onInitialize" is called immediately after the constructor is called.
 * The functions "onStart" and "onUpdate" are called automatically.
 */
export default class DemoSceneScript extends Node {

    @fromScene('AWS Connector')
    public awsConnector: IAwsConnector;
    
    @fromScene('SumerianHost')
    protected hostNode: SumerianHost;

    // TODO: Use a proper type once the Sumerian Hosts library supports 
    // TypeScript definitions for the LexFeature class.
    protected lex: any;

    protected messageContainerEl: HTMLElement;

    protected transcriptTextEl: HTMLElement;

    /**
     * Override constructor.
     * @warn do not fill.
     */
    // @ts-ignore ignoring the super call as we don't want to re-init
    protected constructor() { }

    /**
     * Called when the node is being initialized. This function is called immediatly after the constructor has been called.
     */
    public onInitialize(): void { }

    /**
     * Called when the scene starts.
     */
    public onStart(): void {
        setTimeout(() => {
            this.initChatbot();
            this.initUi();
            this.acquireMicrophoneAccess();
        }, 5 * 1000);
    }

    protected initUi(): void {
        const isRunningInViewport = window.location.host === '';
        if (isRunningInViewport) {
            alert("Due to limitations of the Babylon.JS Editor, this demo can not be run from " +
                "the Preview panel. Instead, use any of the options from the \"Run\" menu.");
            return;
        }

        // Set up interactions for UI buttons.
        document.getElementById('startButton').onclick = () => this.startMainExperience();
        document.getElementById('enableMicButton').onclick = () => this.acquireMicrophoneAccess();
    }

    protected initConversationManagement(): void {
        // Use talk button events to start and stop recording.
        const talkButton = document.getElementById('talkButton');
        talkButton.onmousedown = () => {
            console.log('Begin recording');
            this.lex.beginVoiceRecording();
        };
        talkButton.onmouseup = () => {
            console.log('End recording');
            this.lex.endVoiceRecording();
        };

        // Use events dispatched by the LexFeature to present helpful user messages.
        const {EVENTS} = AwsFeatures.LexFeature;
        this.lex.listenTo(EVENTS.lexResponseReady, response =>
            this.handleLexResponse(response)
        );
        this.lex.listenTo(EVENTS.recordBegin, () => this.hideUserMessages());
        this.lex.listenTo(EVENTS.recordEnd, () => this.displayProcessingMessage());

        // Create convenience references to DOM elements.
        this.messageContainerEl = document.getElementById('userMessageContainer');
        this.transcriptTextEl = document.getElementById('transcriptText');
    }

    protected initChatbot(): void {
        // ===== Configure the AWS SDK =====
        // const cognitoIdentityPoolId = 'us-west-2:3eb8a906-3615-4894-8b5f-582420fe8e49';
        // AWS.config.region = cognitoIdentityPoolId.split(':')[0];
        // AWS.config.credentials = new AWS.CognitoIdentityCredentials({
        //     IdentityPoolId: cognitoIdentityPoolId,
        // });

        AWS.config.region = this.awsConnector.getRegion();
        AWS.config.credentials = this.awsConnector.getCredentials();

        // Initialize chatbot access. If you'd like to use this demo with a different chatbot, just change the
        // botName and botAlias values below.
        const lexClient = new AWS.LexRuntime();
        const botConfig = {
            botName: 'BookTrip',
            botAlias: 'Dev',
        };

        this.lex = new AwsFeatures.LexFeature(lexClient, botConfig);

        const {EVENTS} = AwsFeatures.LexFeature;
        this.lex.listenTo(EVENTS.lexResponseReady, (response) =>
            this.handleLexResponse(response)
        );

        this.initConversationManagement();
    }

    /**
     * Triggered when the user clicks the initial "start" button.
     */
    protected startMainExperience(): void {
        showUiScreen('chatbotUiScreen');

        // Speak a greeting to the user.
        this.hostNode.host.TextToSpeechFeature.play(
            `Hello. How can I help?  You can say things like, "I'd like to rent a car," or, "Help me book a hotel".`
        );
    }

    /**
     * Triggered whenever a response is received from the Lex chatbot.
     * 
     * @param {object} response An object representing the Lex response. For a
     * detailed description of this object's shape, see the documentation for the
     * "data" callback argument described here:
     * {@link https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/LexRuntime.html#postContent-property}
     */
    protected handleLexResponse(response) {
        console.log(response);
        // Remove "processing" CSS class from message container.
        this.messageContainerEl.classList.remove('processing');

        // Display the user's speech input transcript.
        this.displaySpeechInputTranscript(response.inputTranscript);

        // Have the host speak the response from Lex.
        this.hostNode.host.TextToSpeechFeature.play(response.message);
    }

    protected displaySpeechInputTranscript(text) {
        this.transcriptTextEl.innerText = `“${text}”`;
        this.messageContainerEl.classList.add('showingMessage');
    }

    protected displayProcessingMessage() {
        this.messageContainerEl.classList.add('processing');
    }

    protected hideUserMessages() {
        this.messageContainerEl.classList.remove('showingMessage');
    }

    /**
     * Attempts to enable microphone access for Lex, triggering a browser permissions
     * prompt if necessary.
     * @returns {Promise} A Promise which resolves once mic access is allowed or
     * denied by the user or browser.
     */
    protected async acquireMicrophoneAccess() {
        showUiScreen('micInitScreen');

        try {
            await this.lex.enableMicInput();
            console.log('Microphone ready');
            showUiScreen('startScreen');
        } catch (e) {
            // The user or browser denied mic access. Display appropriate messaging
            // to the user.
            if (e.message === 'Permission dismissed') {
                showUiScreen('micPermissionDismissedScreen');
            } else {
                showUiScreen('micDisabledScreen');
            }
        }
    }

    // ===== Keyboard Input ======

    @onKeyboardEvent("z", KeyboardEventTypes.KEYDOWN)
    protected keyDownHandler(info: KeyboardInfo): void {
        this.acquireMicrophoneAccess();
    }

    @onKeyboardEvent(" ", KeyboardEventTypes.KEYDOWN)
    protected talkKeyDownHandler(info: KeyboardInfo): void {
        
    }

    @onKeyboardEvent(" ", KeyboardEventTypes.KEYUP)
    protected talkKeyUpHandler(info: KeyboardInfo): void {
        console.log('End listening.');
    }
}

