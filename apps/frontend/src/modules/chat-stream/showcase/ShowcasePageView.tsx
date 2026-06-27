import type {ChatEventBus} from '@/modules/chat-events/index.js';
import {
  AssistantMessage,
  ContextCompactionBlock,
  ThinkingBlock,
  TodoCard,
  UserMessage,
  WorkingIndicator,
} from '@/modules/chat-ui-components/index.js';

import {AskUserCard} from '../components/MessageList/components/AskUserCard/index.js';
import {SubagentDisclosure} from '../components/MessageList/components/SubagentDisclosure/index.js';
import {ToolExecutionCard} from '../components/MessageList/components/ToolExecutionCard/index.js';
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
              data={mock.askUserErrorData}
            />
          </Specimen>
          <Specimen label='running · unsupported (no submit channel)'>
            <AskUserCard
              status='running'
              callId='ask-6'
              arguments={mock.askUserArgsOptions}
              onSubmit={null}
            />
          </Specimen>
          <Specimen label='running · submit error (click Submit)'>
            <AskUserCard
              status='running'
              callId='ask-7'
              arguments={mock.askUserArgsOptions}
              onSubmit={mock.rejectingAskUserSubmit}
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
              result={mock.toolFailureResult}
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
              result={mock.toolFailureResult}
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
              result={mock.readFileResult}
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
              result={mock.writeFileResult}
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
              result={mock.editFileResult}
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
              result={mock.runCommandResult}
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
              result={mock.findFilesResult}
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
              result={mock.searchFilesResult}
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
              result={mock.webFetchResult}
              data={mock.webFetchData}
            />
          </Specimen>
          <Specimen label='web_fetch_raw · done'>
            <ToolExecutionCard
              callId='t-fetch-raw'
              toolName='web_fetch_raw'
              displayName='Web Fetch (raw)'
              arguments={mock.webFetchRawArgs}
              status='done'
              result={mock.webFetchRawResult}
              data={mock.webFetchRawData}
            />
          </Specimen>
          <Specimen label='web_search · done'>
            <ToolExecutionCard
              callId='t-websearch'
              toolName='web_search'
              displayName='Web Search'
              arguments={mock.webSearchArgs}
              status='done'
              result={mock.webSearchResult}
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
              result={mock.loadSkillResult}
              data={mock.loadSkillData}
            />
          </Specimen>
          <Specimen label='get_current_time · done'>
            <ToolExecutionCard
              callId='t-time'
              toolName='get_current_time'
              displayName='Get Current Time'
              arguments={mock.getCurrentTimeArgs}
              status='done'
              result={mock.getCurrentTimeResult}
              data={mock.getCurrentTimeData}
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
          <Specimen label='dispatch · running'>
            <SubagentDisclosure
              mode='dispatch'
              status='running'
              eventBus={subagentEventBus}
              {...mock.subagentBaseProps}
            />
          </Specimen>
          <Specimen label='dispatch · complete'>
            <SubagentDisclosure
              mode='dispatch'
              status='complete'
              eventBus={subagentEventBus}
              {...mock.subagentBaseProps}
            />
          </Specimen>
          <Specimen label='dispatch · error'>
            <SubagentDisclosure
              mode='dispatch'
              status='error'
              eventBus={subagentEventBus}
              {...mock.subagentBaseProps}
            />
          </Specimen>
          <Specimen label='resume · running'>
            <SubagentDisclosure
              mode='resume'
              status='running'
              eventBus={subagentEventBus}
              {...mock.subagentBaseProps}
            />
          </Specimen>
          <Specimen label='resume · complete'>
            <SubagentDisclosure
              mode='resume'
              status='complete'
              eventBus={subagentEventBus}
              {...mock.subagentBaseProps}
            />
          </Specimen>
          <Specimen label='resume · error'>
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
