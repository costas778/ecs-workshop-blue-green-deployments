import { Construct } from 'constructs';
import { App, Stack, StackProps } from 'aws-cdk-lib';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipelineActions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { Artifact } from 'aws-cdk-lib/aws-codepipeline';

export class BlueGreenContainerImageStack extends Stack {
    
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        // GitHub repository details, no need to use CfnParameters here
        const githubRepoOwner = 'costas778';  // Replace with your GitHub username or organization name
        const githubRepoName = 'ecs-workshop-blue-green-deployments';  // Replace with your GitHub repository name
        const githubOAuthToken = secretsmanager.Secret.fromSecretNameV2(this, 'GithubToken', 'my-github-token'); // Secret with GitHub token

        // Create an Artifact to capture the source output
        const sourceOutput = new Artifact();

        // GitHub source action for CodePipeline
        const sourceAction = new codepipelineActions.GitHubSourceAction({
            actionName: 'GitHub_Source',
            owner: githubRepoOwner,
            repo: githubRepoName,
            branch: 'main',  // Set this to the branch you want to track
            oauthToken: githubOAuthToken.secretValue,
            output: sourceOutput,  // Pass the Artifact to capture the output
        });

        // Create the build project
        const buildProject = new codebuild.Project(this, 'BuildProject', {
            projectName: 'BuildContainerImage',
            buildSpec: codebuild.BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    build: {
                        commands: [
                            'echo Building container image...',
                            'docker build -t my-container-image .',
                        ]
                    }
                },
                artifacts: {
                    files: ['**/*'],
                }
            })
        });

        // Define the pipeline and its stages
        const pipeline = new codepipeline.Pipeline(this, 'BlueGreenPipeline', {
            pipelineName: 'BlueGreenEcsPipeline',
        });

        // Add the Source stage to pipeline
        pipeline.addStage({
            stageName: 'Source',
            actions: [sourceAction],
        });

        // Add Build stage to pipeline
        const buildAction = new codepipelineActions.CodeBuildAction({
            actionName: 'Build',
            project: buildProject,
            input: sourceOutput,  // Input from the source stage
            outputs: [new Artifact()],  // Output artifact from the build stage
        });

        pipeline.addStage({
            stageName: 'Build',
            actions: [buildAction],
        });
    }
}

const app = new App();
new BlueGreenContainerImageStack(app, 'BlueGreenContainerImageStack', {
    description: 'Builds the blue/green deployment container build stack'
});
