import { useState } from 'react';
import useIdeaGraph from './hooks/useIdeaGraph';
import useAuth from './hooks/useAuth';
import useMultiUser from './hooks/useMultiUser';
import Header from './components/Header';
import GenreChips from './components/GenreChips';
import ErrorBanner from './components/ErrorBanner';
import GraphView from './components/GraphView';
import InputView from './components/InputView';
import ListView from './components/ListView';
import LayerView from './components/LayerView';
import DetailPanel from './components/DetailPanel';
import AuthScreen from './components/AuthScreen';

export default function App() {
  const { user, loading: authLoading, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut } = useAuth();
  const [viewMode, setViewMode] = useState("personal");

  const {
    data,
    input, setInput,
    view, setView,
    loading, loadingMsg,
    selectedId, setSelectedId,
    tagInput, setTagInput,
    initLoading,
    error, setError,
    allTags,
    connections,
    selectedIdea,
    connectedIdeas,
    tagIndex,
    handleSave,
    handleDelete,
    handleReset,
    handleAddTag,
    handleRemoveTag,
    handleForceLayerUpdate,
  } = useIdeaGraph(user?.id);

  const multiUser = useMultiUser(user?.id, viewMode === "integrated");

  // Switch data source based on view mode
  const isIntegrated = viewMode === "integrated" && multiUser;
  const displayIdeas = isIntegrated ? multiUser.mergedIdeas : data.ideas;
  const displayConnections = isIntegrated ? multiUser.mergedConnections : connections;
  const displayGenres = isIntegrated ? multiUser.mergedGenres : data.genres;

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 text-slate-400">
        <div className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-indigo-400 animate-spin mr-2"></div>
        読み込み中...
      </div>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        onGoogleLogin={signInWithGoogle}
        onEmailLogin={signInWithEmail}
        onEmailSignUp={signUpWithEmail}
        loading={authLoading}
      />
    );
  }

  if (initLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 text-slate-400">
        <div className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-indigo-400 animate-spin mr-2"></div>
        読み込み中...
      </div>
    );
  }

  // R-04: Find latest idea with serendipity for InputView
  const latestSerendipity = (() => {
    for (let i = data.ideas.length - 1; i >= 0; i--) {
      if (data.ideas[i].serendipity?.length > 0) return data.ideas[i].serendipity;
    }
    return null;
  })();

  const getL = (level) => (data.tagLayers.find(l => l.level === level) || { groups: [] }).groups;

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-200">
      <Header
        ideaCount={displayIdeas.length}
        view={view}
        setView={setView}
        user={user}
        onSignOut={signOut}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />

      <GenreChips genres={displayGenres} />

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {/* Main */}
      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 overflow-hidden flex flex-col">

          {view === "input" && (
            <InputView
              input={input} setInput={setInput}
              loading={loading} loadingMsg={loadingMsg}
              handleSave={handleSave}
              ideas={data.ideas} genres={data.genres}
              selectedId={selectedId} setSelectedId={setSelectedId}
              latestSerendipity={latestSerendipity}
            />
          )}

          {view === "graph" && (
            <div className="flex-1 overflow-hidden">
              <GraphView
                ideas={displayIdeas} connections={displayConnections}
                genres={displayGenres} onSelect={setSelectedId}
                selectedId={selectedId}
                userColorMap={isIntegrated ? multiUser.userColorMap : null}
                profiles={isIntegrated ? multiUser.profiles : null}
              />
            </div>
          )}

          {view === "list" && (
            <ListView
              ideas={displayIdeas} connections={displayConnections}
              genres={displayGenres} selectedId={selectedId}
              setSelectedId={setSelectedId}
            />
          )}

          {view === "layers" && (
            <LayerView
              tagLayers={data.tagLayers} allTags={allTags}
              loading={loading} loadingMsg={loadingMsg}
              handleForceLayerUpdate={handleForceLayerUpdate}
            />
          )}
        </div>

        {selectedIdea && (
          <DetailPanel
            selectedIdea={selectedIdea} genres={data.genres}
            connectedIdeas={connectedIdeas} tagIndex={tagIndex}
            tagInput={tagInput} setTagInput={setTagInput}
            handleAddTag={handleAddTag} handleRemoveTag={handleRemoveTag}
            handleDelete={handleDelete} setSelectedId={setSelectedId}
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-slate-800 text-xs text-slate-600">
        <span>
          {displayGenres.length}ジャンル · {displayConnections.length}リンク · {allTags.length}タグ
          {getL(1).length > 0 && ` · L1:${getL(1).length}`}
          {getL(2).length > 0 && ` · L2:${getL(2).length}`}
          {getL(3).length > 0 && ` · L3:${getL(3).length}`}
        </span>
        <button onClick={handleReset} className="hover:text-red-400 transition-colors">リセット</button>
      </div>
    </div>
  );
}
