import type {ChatEventBus} from '@/modules/chat-events/index.js';

import {AskUserCard} from '../components/MessageList/components/AskUserCard/index.js';
import {AssistantMessage} from '../components/MessageList/components/AssistantMessage/index.js';
import {ContextCompactionBlock} from '../components/MessageList/components/ContextCompactionBlock/index.js';
import {SubagentDisclosure} from '../components/MessageList/components/SubagentDisclosure/index.js';
import {ThinkingBlock} from '../components/MessageList/components/ThinkingBlock/index.js';
import {TodoCard} from '../components/MessageList/components/TodoCard/index.js';
import {ToolExecutionCard} from '../components/MessageList/components/ToolExecutionCard/index.js';
import {UserMessage} from '../components/MessageList/components/UserMessage/index.js';
import {WorkingIndicator} from '../components/MessageList/components/WorkingIndicator/index.js';
import {ShowcaseSection} from './components/ShowcaseSection/index.js';
import {Specimen} from './components/Specimen/index.js';
import * as mock from './mock-data.js';
import styles from './styles.module.css';

interface ShowcasePageViewProps {
  subagentEventBus: ChatEventBus;
}

const SECTIONS = [
  {id: 'messages', title: 'Messages'},
  {id: 'ask-user', title: 'AskUserCard'},
  {id: 'tools', title: 'ToolExecutionCard'},
  {id: 'thinking', title: 'ThinkingBlock'},
  {id: 'todo', title: 'TodoCard'},
  {id: 'subagent', title: 'SubagentDisclosure'},
  {id: 'compaction', title: 'ContextCompactionBlock'},
  {id: 'working', title: 'WorkingIndicator'},
] as const;

export function ShowcasePageView({subagentEventBus}: ShowcasePageViewProps) {
  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className={styles.navLink}>
            {s.title}
          </a>
        ))}
      </nav>
      <div className={styles.column}>
        <ShowcaseSection id='messages' title='Messages'>
          <Specimen label='user · short'>
            <UserMessage id='u1' content={mock.userMessageShort} />
          </Specimen>
          <Specimen label='user · markdown'>
            <UserMessage id='u2' content={mock.userMessageMarkdown} />
          </Specimen>
          <Specimen label='assistant · markdown'>
            <AssistantMessage id='a1' content={mock.assistantMessageMarkdown} />
          </Specimen>
          <Specimen label='assistant · empty (streaming)'>
            <AssistantMessage id='a2' content='' />
          </Specimen>
        </ShowcaseSection>

        <ShowcaseSection id='ask-user' title='AskUserCard'>
          <Specimen label='running · free text'>
            <AskUserCard
              status='running'
              callId='ask-1'
              arguments={mock.askUserArgsFreeText}
              onSubmit={mock.noopAskUserSubmit}
            />
          </Specimen>
          <Specimen label='running · with options'>
            <AskUserCard
              status='running'
              callId='ask-2'
              arguments={mock.askUserArgsOptions}
              onSubmit={mock.noopAskUserSubmit}
            />
          </Specimen>
          <Specimen label='done'>
            <AskUserCard
              status='done'
              callId='ask-3'
              arguments={mock.askUserArgsOptions}
              onSubmit={mock.noopAskUserSubmit}
              data={mock.askUserDoneData}
            />
          </Specimen>
          <Specimen label='failure'>
            <AskUserCard
              status='failure'
              callId='ask-4'
              arguments={mock.askUserArgsOptions}
              onSubmit={mock.noopAskUserSubmit}
              data={mock.askUserFailureData}
            />
          </Specimen>
          <Specimen label='error'>
            <AskUserCard
              status='error'
              callId='ask-5'
              arguments={mock.askUserArgsOptions}
              onSubmit={mock.noopAskUserSubmit}
              data={mock.askUserFailureData}
            />
          </Specimen>
        </ShowcaseSection>

        <ShowcaseSection id='tools' title='ToolExecutionCard'>
          <Specimen label='running'>
            <ToolExecutionCard
              callId='t-run'
              toolName='read_file'
              displayName='Read File'
              arguments={mock.readFileArgs}
              status='running'
            />
          </Specimen>
          <Specimen label='failure'>
            <ToolExecutionCard
              callId='t-fail'
              toolName='run_command'
              displayName='Run Command'
              arguments={mock.runCommandArgs}
              status='failure'
              data={mock.toolFailureData}
            />
          </Specimen>
          <Specimen label='error'>
            <ToolExecutionCard
              callId='t-err'
              toolName='run_command'
              displayName='Run Command'
              arguments={mock.runCommandArgs}
              status='error'
              data={mock.toolFailureData}
            />
          </Specimen>
          <Specimen label='read_file · done'>
            <ToolExecutionCard
              callId='t-read'
              toolName='read_file'
              displayName='Read File'
              arguments={mock.readFileArgs}
              status='done'
              data={mock.readFileData}
            />
          </Specimen>
          <Specimen label='write_file · done'>
            <ToolExecutionCard
              callId='t-write'
              toolName='write_file'
              displayName='Write File'
              arguments={mock.writeFileArgs}
              status='done'
              data={mock.writeFileData}
            />
          </Specimen>
          <Specimen label='edit_file · done'>
            <ToolExecutionCard
              callId='t-edit'
              toolName='edit_file'
              displayName='Edit File'
              arguments={mock.editFileArgs}
              status='done'
              data={mock.editFileData}
            />
          </Specimen>
          <Specimen label='run_command · done'>
            <ToolExecutionCard
              callId='t-cmd'
              toolName='run_command'
              displayName='Run Command'
              arguments={mock.runCommandArgs}
              status='done'
              data={mock.runCommandData}
            />
          </Specimen>
          <Specimen label='find_files · done'>
            <ToolExecutionCard
              callId='t-find'
              toolName='find_files'
              displayName='Find Files'
              arguments={mock.findFilesArgs}
              status='done'
              data={mock.findFilesData}
            />
          </Specimen>
          <Specimen label='search_files · done'>
            <ToolExecutionCard
              callId='t-search'
              toolName='search_files'
              displayName='Search Files'
              arguments={mock.searchFilesArgs}
              status='done'
              data={mock.searchFilesData}
            />
          </Specimen>
          <Specimen label='web_fetch · done'>
            <ToolExecutionCard
              callId='t-fetch'
              toolName='web_fetch'
              displayName='Web Fetch'
              arguments={mock.webFetchArgs}
              status='done'
              data={mock.webFetchData}
            />
          </Specimen>
          <Specimen label='web_search · done'>
            <ToolExecutionCard
              callId='t-websearch'
              toolName='web_search'
              displayName='Web Search'
              arguments={mock.webSearchArgs}
              status='done'
              data={mock.webSearchData}
            />
          </Specimen>
          <Specimen label='load_skill · done'>
            <ToolExecutionCard
              callId='t-skill'
              toolName='load_skill'
              displayName='Load Skill'
              arguments={mock.loadSkillArgs}
              status='done'
              data={mock.loadSkillData}
            />
          </Specimen>
        </ShowcaseSection>

        <ShowcaseSection id='thinking' title='ThinkingBlock'>
          <Specimen label='thinking (not done)'>
            <ThinkingBlock content={mock.thinkingContent} done={false} />
          </Specimen>
          <Specimen label='done'>
            <ThinkingBlock content={mock.thinkingContent} done={true} />
          </Specimen>
        </ShowcaseSection>

        <ShowcaseSection id='todo' title='TodoCard'>
          <Specimen label='in progress (mixed)'>
            <TodoCard items={mock.todoItemsMixed} />
          </Specimen>
          <Specimen label='all complete'>
            <TodoCard items={mock.todoItemsComplete} />
          </Specimen>
        </ShowcaseSection>

        <ShowcaseSection id='subagent' title='SubagentDisclosure'>
          <Specimen label='running'>
            <SubagentDisclosure
              mode='dispatch'
              status='running'
              eventBus={subagentEventBus}
              {...mock.subagentBaseProps}
            />
          </Specimen>
          <Specimen label='complete'>
            <SubagentDisclosure
              mode='dispatch'
              status='complete'
              eventBus={subagentEventBus}
              {...mock.subagentBaseProps}
            />
          </Specimen>
          <Specimen label='error'>
            <SubagentDisclosure
              mode='resume'
              status='error'
              eventBus={subagentEventBus}
              {...mock.subagentBaseProps}
            />
          </Specimen>
        </ShowcaseSection>

        <ShowcaseSection id='compaction' title='ContextCompactionBlock'>
          <Specimen label='in-progress'>
            <ContextCompactionBlock status='in-progress' />
          </Specimen>
          <Specimen label='done'>
            <ContextCompactionBlock
              status='done'
              beforeTokens={128000}
              afterTokens={32000}
              summary={mock.compactionSummary}
            />
          </Specimen>
          <Specimen label='failed'>
            <ContextCompactionBlock
              status='failed'
              errorMessage='Compaction aborted: upstream timeout.'
            />
          </Specimen>
        </ShowcaseSection>

        <ShowcaseSection id='working' title='WorkingIndicator'>
          <Specimen label='default'>
            <WorkingIndicator />
          </Specimen>
        </ShowcaseSection>
      </div>
    </div>
  );
}
