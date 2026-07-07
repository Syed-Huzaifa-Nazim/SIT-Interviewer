import React, { useState } from 'react';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import Button from '../components/ui/Button';
import { Play, Sparkles, Code, ShieldCheck, Terminal } from 'lucide-react';

const CodingInterview = () => {
  const [language, setLanguage] = useState('python');
  const [code, setCode] = useState(`def solve(arr, target):\n    # Write your python code here\n    pass`);
  
  const [challenge, setChallenge] = useState('twosum');
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState('');
  const [review, setReview] = useState(null);
  const [error, setError] = useState('');

  const challengesList = {
    twosum: {
      title: '1. Two Sum Challenge',
      desc: 'Given an array of integers `nums` and an integer `target`, return indices of the two numbers such that they add up to `target`. You may assume that each input would have exactly one solution.',
      example: 'Input: nums = [2,7,11,15], target = 9\nOutput: [0,1]\nExplanation: Because nums[0] + nums[1] == 9, we return [0, 1].',
      defaultCode: {
        python: `def two_sum(nums, target):\n    # Write your solution here\n    seen = {}\n    for i, num in enumerate(nums):\n        diff = target - num\n        if diff in seen:\n            return [seen[diff], i]\n        seen[num] = i\n    return []\n\nprint(two_sum([2, 7, 11, 15], 9))`,
        javascript: `function twoSum(nums, target) {\n    // Write your solution here\n    const seen = {};\n    for (let i = 0; i < nums.length; i++) {\n        const diff = target - nums[i];\n        if (diff in seen) {\n            return [seen[diff], i];\n        }\n        seen[nums[i]] = i;\n    }\n    return [];\n}\n\nconsole.log(twoSum([2, 7, 11, 15], 9));`,
        java: `public class Solution {\n    public static int[] twoSum(int[] nums, int target) {\n        // Write solution here\n        return new int[]{0, 1};\n    }\n}`,
        cpp: `std::vector<int> twoSum(std::vector<int>& nums, int target) {\n    // Write solution here\n    return {0, 1};\n}`
      }
    },
    reverse: {
      title: '2. Reverse String',
      desc: 'Write a function that reverses a string. The input string is given as an array of characters.',
      example: "Input: s = ['h','e','l','l','o']\nOutput: ['o','l','l','e','h']",
      defaultCode: {
        python: `def reverse_string(s):\n    # Write solution here\n    s.reverse()\n    return s\n\nprint(reverse_string(['h','e','l','l','o']))`,
        javascript: `function reverseString(s) {\n    // Write solution here\n    return s.reverse();\n}\n\nconsole.log(reverseString(['h','e','l','l','o']));`,
        java: `public class Solution {\n    public static void reverseString(char[] s) {\n        // Write solution here\n    }\n}`,
        cpp: `void reverseString(vector<char>& s) {\n    // Write solution here\n}`
      }
    },
    fibonacci: {
      title: '3. Fibonacci Number',
      desc: 'Calculate the N-th Fibonacci number. F(0) = 0, F(1) = 1, F(N) = F(N-1) + F(N-2).',
      example: 'Input: n = 4\nOutput: 3',
      defaultCode: {
        python: `def fib(n):\n    # Write solution here\n    if n <= 1: return n\n    return fib(n-1) + fib(n-2)\n\nprint(fib(4))`,
        javascript: `function fib(n) {\n    // Write solution here\n    if (n <= 1) return n;\n    return fib(n-1) + fib(n-2);\n}\n\nconsole.log(fib(4));`,
        java: `public class Solution {\n    public static int fib(int n) {\n        return n;\n    }\n}`,
        cpp: `int fib(int n) {\n    return n;\n}`
      }
    }
  };

  const handleChallengeChange = (key) => {
    setChallenge(key);
    const selected = challengesList[key];
    setCode(selected.defaultCode[language] || selected.defaultCode['python']);
  };

  const handleLanguageChange = (lang) => {
    setLanguage(lang);
    const selected = challengesList[challenge];
    setCode(selected.defaultCode[lang] || `// Code workspace for ${lang}`);
  };

  const handleRunCode = async () => {
    setRunning(true);
    setError('');
    setOutput('');
    setReview(null);

    try {
      const res = await api.post('/interviews/evaluate-code', { code, language });
      setOutput(res.data.execution_output);
      setReview(res.data.ai_review);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to execute code compilation. Check backend runner.');
    } finally {
      setRunning(false);
    }
  };

  const activeChallenge = challengesList[challenge];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Code}
        title="Coding Assessment Workspace"
        subtitle="Solve problems, compile scripts, and run AI code reviews to analyze time & space complexities."
      />

      {error && <Alert variant="error">{error}</Alert>}

      {/* Main Workspace Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Side: Challenge Picker & Instructions */}
        <div className="lg:col-span-5 space-y-6">
          {/* Picker */}
          <Card className="space-y-4">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Select Problem</label>
            <div className="space-y-2">
              {Object.keys(challengesList).map((key) => (
                <button
                  key={key}
                  onClick={() => handleChallengeChange(key)}
                  className={`w-full text-left p-3.5 rounded-xl border transition cursor-pointer ${challenge === key ? 'bg-primary-600/10 border-primary-500 text-slate-900 dark:text-white' : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'}`}
                >
                  <span className="text-sm font-bold block">{challengesList[key].title}</span>
                </button>
              ))}
            </div>
          </Card>

          {/* Description */}
          <Card className="space-y-4">
            <CardHeader>
              <CardTitle>{activeChallenge.title}</CardTitle>
            </CardHeader>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{activeChallenge.desc}</p>
            
            <div className="p-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Example Context</span>
              <pre className="text-xs text-primary-600 dark:text-primary-300 font-mono whitespace-pre-wrap">{activeChallenge.example}</pre>
            </div>
          </Card>
        </div>

        {/* Right Side: Code Editor Workspace */}
        <div className="lg:col-span-7 space-y-6">
          <Card padding={false} className="overflow-hidden flex flex-col min-h-[500px]">
            {/* Toolbar */}
            <div className="px-5 py-3.5 bg-slate-100 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
              <select
                className="glass-input py-1 px-3 text-xs bg-white dark:bg-slate-900 cursor-pointer text-slate-800 dark:text-slate-200"
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value)}
              >
                <option value="python">Python 3</option>
                <option value="javascript">JavaScript (Node)</option>
                <option value="java">Java 17</option>
                <option value="cpp">C++ 20</option>
              </select>

              <Button
                onClick={handleRunCode}
                disabled={running}
                loading={running}
                size="sm"
                icon={Play}
              >
                {running ? 'Running...' : 'Run & Review'}
              </Button>
            </div>

            {/* Code Field */}
            <textarea
              className="flex-1 w-full bg-slate-950 p-5 font-mono text-sm text-slate-100 border-none outline-none focus:ring-0 min-h-[350px] resize-none leading-relaxed"
              style={{ tabSize: 4 }}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />

            {/* Bottom Console Terminal Panel */}
            <div className="bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
              <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 flex items-center gap-2 text-slate-500 text-xs font-semibold">
                <Terminal size={14} />
                <span>Console Terminal Output</span>
              </div>
              <pre className="p-4 text-xs font-mono text-emerald-600 dark:text-emerald-400 bg-slate-50 dark:bg-slate-950/20 max-h-36 overflow-y-auto whitespace-pre-wrap leading-normal">
                {output || 'Click "Run & Review" to execute output logs...'}
              </pre>
            </div>
          </Card>

          {/* AI Code Review Drawer */}
          {review && (
            <Card variant="highlighted" className="space-y-6">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="text-primary-500 dark:text-primary-400" />
                <CardTitle className="mb-0">AI Code Review Report</CardTitle>
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl text-center space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">Time Complexity</span>
                  <span className="text-base font-mono font-bold text-primary-600 dark:text-primary-300 block">{review.complexity_time}</span>
                </div>
                
                <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl text-center space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">Space Complexity</span>
                  <span className="text-base font-mono font-bold text-indigo-600 dark:text-indigo-300 block">{review.complexity_space}</span>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl text-center space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">AI Quality Rating</span>
                  <span className="text-base font-bold text-emerald-500 dark:text-emerald-400 block">{review.rating} / 10</span>
                </div>
              </div>

              {/* Bugs & Errors */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Logic Defects / Security Checks</span>
                {review.bugs.length === 0 ? (
                  <Alert variant="success">
                    <span className="flex items-center gap-2">
                      <ShieldCheck size={16} />
                      No structural bugs or compiler errors detected. Good execution flow!
                    </span>
                  </Alert>
                ) : (
                  <div className="space-y-2">
                    {review.bugs.map((bug, idx) => (
                      <Alert key={idx} variant="error">{bug}</Alert>
                    ))}
                  </div>
                )}
              </div>

              {/* Suggestions */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">AI Code Improvement Suggestions</span>
                <ul className="space-y-2">
                  {review.suggestions.map((sug, idx) => (
                    <li key={idx} className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed flex items-start gap-2">
                      <div className="p-0.5 bg-primary-500/20 border border-primary-500/40 text-primary-500 dark:text-primary-400 rounded mt-0.5 font-bold text-[10px] w-5 h-5 flex items-center justify-center shrink-0">
                        {idx + 1}
                      </div>
                      <span>{sug}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          )}
        </div>

      </div>
    </div>
  );
};

export default CodingInterview;
