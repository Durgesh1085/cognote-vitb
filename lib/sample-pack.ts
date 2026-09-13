import type { StudyPack } from "./study-pack";

export const samplePack: StudyPack = {
  title: "Process Management & CPU Scheduling",
  summary: "Processes move through defined states while the operating system schedules CPU time, switches context, and balances responsiveness, throughput, and fairness.",
  highYieldTopics: [
    { topic: "Process states and transitions", explanation: "A process moves among new, ready, running, waiting, and terminated states. Scheduling dispatches a ready process; I/O or an event moves a running process to waiting.", sourcePage: 4, importance: "high" },
    { topic: "Process Control Block (PCB)", explanation: "The PCB stores execution context such as state, program counter, registers, scheduling data, and memory information so a process can resume after a switch.", sourcePage: 7, importance: "high" },
    { topic: "Context switching", explanation: "A context switch saves one process state and restores another. It enables multitasking but adds overhead because the CPU performs no user work during the switch.", sourcePage: 9, importance: "high" },
    { topic: "Scheduling criteria", explanation: "Algorithms are compared using CPU utilization, throughput, turnaround time, waiting time, and response time. The preferred metric depends on workload goals.", sourcePage: 13, importance: "medium" },
    { topic: "Round Robin scheduling", explanation: "Each ready process receives a fixed time quantum. A very large quantum approaches FCFS; a very small quantum increases context-switch overhead.", sourcePage: 21, importance: "high" },
  ],
  mustRemember: [
    { text: "Turnaround time = completion time − arrival time.", sourcePage: 14 },
    { text: "Waiting time is the total time a process spends in the ready queue.", sourcePage: 14 },
    { text: "Response time measures the delay from submission until the first response, not completion.", sourcePage: 15 },
    { text: "Preemptive scheduling can interrupt a running process; non-preemptive scheduling cannot forcibly take the CPU away.", sourcePage: 17 },
    { text: "Shortest Job First minimizes average waiting time when burst lengths are known.", sourcePage: 19 },
  ],
  commonTraps: [
    { mistake: "Treating response time and turnaround time as the same metric.", correction: "Response time ends at the first response; turnaround time ends only when the process completes." },
    { mistake: "Assuming a smaller Round Robin quantum is always better.", correction: "A smaller quantum can improve responsiveness, but too small a value wastes CPU time on frequent context switches." },
    { mistake: "Calling every scheduler preemptive.", correction: "FCFS and non-preemptive SJF let the current CPU burst finish; Round Robin is preemptive." },
  ],
  quiz: [
    { question: "Which process state contains processes that are prepared to run but waiting for CPU time?", options: ["New", "Ready", "Waiting", "Terminated"], correctIndex: 1, explanation: "A ready process has everything it needs except the CPU. A waiting process is blocked for an event such as I/O completion.", sourcePage: 4 },
    { question: "Why does the operating system maintain a Process Control Block?", options: ["To store only the process source code", "To prevent every context switch", "To preserve the process execution state and management data", "To assign one CPU permanently to a process"], correctIndex: 2, explanation: "The PCB holds the state needed to manage, pause, and later resume a process, including register values and scheduling information.", sourcePage: 7 },
    { question: "What happens when the Round Robin time quantum becomes very large?", options: ["It behaves more like FCFS", "Context switching becomes continuous", "Every process finishes simultaneously", "It becomes Shortest Job First"], correctIndex: 0, explanation: "With a quantum large enough for most CPU bursts to finish, processes effectively run in ready-queue order like FCFS.", sourcePage: 21 },
    { question: "Which metric measures time from submission until a process first produces a response?", options: ["Throughput", "Waiting time", "Turnaround time", "Response time"], correctIndex: 3, explanation: "Response time measures the initial delay perceived by the user; it does not wait for the process to complete.", sourcePage: 15 },
    { question: "Which scheduling algorithm gives the minimum average waiting time when future CPU burst lengths are known?", options: ["First-Come, First-Served", "Shortest Job First", "Round Robin", "Priority scheduling"], correctIndex: 1, explanation: "Selecting the shortest next CPU burst minimizes average waiting time, although exact future burst lengths are usually difficult to know.", sourcePage: 19 },
  ],
};
