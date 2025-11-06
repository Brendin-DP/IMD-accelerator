"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Question {
  id: number;
  category: string;
  text: string;
}

export default function Assessment360() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});

  useEffect(() => {
    fetch("http://localhost:4000/assessment_questions_360")
      .then((res) => res.json())
      .then((data) => setQuestions(data));
  }, []);

  const handleAnswerChange = (questionId: number, value: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  };

  const handleNext = () => {
    if (current < questions.length - 1) {
      setCurrent(current + 1);
    } else {
      alert("Assessment complete!");
    }
  };

  if (!questions.length) return <p>Loading questions...</p>;

  const currentQuestion = questions[current];

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">360 Assessment</h1>
      <p className="text-muted-foreground">
        Question {current + 1} of {questions.length}
      </p>
      <div className="border rounded-lg p-6 space-y-4">
        <p className="text-lg font-medium">{currentQuestion.text}</p>
        
        <div className="border-t my-4" />
        
        <div className="space-y-2">
          <label htmlFor={`answer-${currentQuestion.id}`} className="text-sm font-medium">
            Your response (optional)
          </label>
          <textarea
            id={`answer-${currentQuestion.id}`}
            value={answers[currentQuestion.id] || ""}
            onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
            placeholder="Enter your response here..."
            rows={6}
            className={cn(
              "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
              "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
              "resize-none"
            )}
          />
        </div>
      </div>
      
      <div className="flex justify-end">
        <Button onClick={handleNext}>
          {current < questions.length - 1 ? "Next" : "Finish"}
        </Button>
      </div>
    </div>
  );
}