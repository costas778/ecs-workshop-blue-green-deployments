#!/usr/bin/env node

// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { Construct } from 'constructs';
import 'source-map-support/register';
import { Stack, App, StackProps, CfnParameter } from 'aws-cdk-lib';
import * as EcsBlueGreen from '../lib';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export class BlueGreenPipelineStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        const deploymentConfigName = new CfnParameter(this, 'deploymentConfigName', {
            type: 'String',
            default: 'CodeDeployDefault.ECSLinear10PercentEvery1Minutes',
            allowedValues: [
                'CodeDeployDefault.ECSLinear10PercentEvery1Minutes',
                'CodeDeployDefault.ECSLinear10PercentEvery3Minutes',
                'CodeDeployDefault.ECSCanary10Percent5Minutes',
                'CodeDeployDefault.ECSCanary10Percent15Minutes',
                'CodeDeployDefault.ECSAllAtOnce'
            ],
            description: 'Shifts x percentage of traffic every x minutes until all traffic is shifted',
        });

        const taskSetTerminationTimeInMinutes = new CfnParameter(this, 'taskSetTerminationTimeInMinutes', {
            type: 'Number',
            default: '10',
            description: 'TaskSet termination time in minutes',
        });

        // Build the stack
        const ecsBlueGreenCluster = new EcsBlueGreen.EcsBlueGreenCluster(this, 'EcsBlueGreenCluster', {
            cidr: process.env.CIDR_RANGE,
        });

        // Define the source output artifact
        const sourceOutput = new codepipeline.Artifact();

        // Create GitHub source action
        const sourceAction = new codepipeline_actions.GitHubSourceAction({
            actionName: 'Checkout',
            owner: 'costas778', // Replace with your GitHub username
            repo: 'ecs-workshop-blue-green-deployments', // Replace with your repository name
            oauthToken: secretsmanager.Secret.fromSecretNameV2(this, 'GithubToken', 'my-github-token'), // Make sure to set this in Secrets Manager
            output: sourceOutput,
            branch: 'main', // Replace with your target branch if different
        });

        // Create the CodePipeline
        const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
            pipelineName: 'BlueGreenDeploymentPipeline',
            restartExecutionOnUpdate: true,
        });

        // Add the source stage to the pipeline
        pipeline.addStage({
            stageName: 'Source',
            actions: [sourceAction],
        });

        // Create the blue/green deployment pipeline
        new EcsBlueGreen.EcsBlueGreenPipeline(this, 'EcsBlueGreenPipeline', {
            apiName: process.env.API_NAME,
            deploymentConfigName: deploymentConfigName.valueAsString,
            cluster: ecsBlueGreenCluster.cluster,
            vpc: ecsBlueGreenCluster.vpc,
            containerPort: Number(process.env.CONTAINER_PORT),
            ecrRepoName: process.env.ECR_REPO_NAME,
            codeBuildProjectName: process.env.CODE_BUILD_PROJECT_NAME,
            codeRepoName: process.env.CODE_REPO_NAME,
            ecsTaskRoleArn: process.env.ECS_TASK_ROLE_ARN,
            taskSetTerminationTimeInMinutes: taskSetTerminationTimeInMinutes.valueAsNumber,
            sourceOutput: sourceOutput, // Pass the source output artifact to your deployment
        });
    }
}

const app = new App();
new BlueGreenPipelineStack(app, 'BlueGreenPipelineStack', {
    description: 'Builds the blue/green deployment pipeline stack',
});
