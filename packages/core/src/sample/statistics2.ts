import type { LessonSpec } from './builder';

/** Lessons 3–4 of the sample course "Reading the world with data". */
export const statisticsLessonsB: LessonSpec[] = [
  {
    title: 'Center and spread',
    summary: 'Mean and median as measures of center, range and interquartile range as measures of spread, and why outliers matter.',
    objectives: [
      'Calculate the mean, median, range and interquartile range of a small data set',
      'Choose a resistant measure of center when a distribution is skewed or has outliers',
    ],
    keyIdeas: [
      'The mean balances the data; the median splits it in half.',
      'The median and IQR are resistant: one extreme value barely moves them.',
      'Report a center together with a spread; neither means much alone.',
    ],
    segments: [
      ['warmup', 'The billionaire walks in', 6, 'Ten people in a café earn a typical salary. A billionaire walks in. What happens to the "average" income?', 'Let students argue before any calculation; the intuition is the lesson.'],
      ['teach', 'Mean and median', 12, 'Compute both for a small data set, then add an outlier and compute again. Record both results side by side.', 'Use the data set 4, 5, 5, 6, 7, 8, 9, then add 40.'],
      ['teach', 'Range and IQR', 10, 'Find quartiles by splitting the ordered data in halves. Compare range and IQR with and without the outlier.', 'Quartile conventions vary; say that textbooks and calculators may differ slightly.'],
      ['practice', 'Which summary fits?', 14, 'Groups get three short data sets and choose mean/SD-style or median/IQR summaries, with a reason for each.', ''],
      ['check', 'Exit ticket', 8, 'One calculation and one "which measure would you report?" question.', ''],
    ],
    vocabulary: [
      ['Mean', 'The sum of the values divided by how many values there are.'],
      ['Median', 'The middle value when the data is in order; the average of the two middle values if the count is even.'],
      ['Range', 'The largest value minus the smallest value.'],
      ['Interquartile range (IQR)', 'The third quartile minus the first quartile: the spread of the middle half of the data.'],
      ['Resistant', 'Describes a statistic that is not strongly affected by extreme values.'],
    ],
    slides: [
      ['title', 'Center and spread', ['Lesson 3'], ''],
      ['quote', 'When a billionaire walks into a café, the average customer becomes a millionaire.', [], 'Use this to launch the warm-up discussion.'],
      ['bullets', 'Two ways to find the center', ['Mean: add them up, divide by the count', 'Median: the middle value in order', 'Outliers pull the mean, not the median'], ''],
      ['bullets', 'Measuring spread', ['Range = max − min', 'IQR = Q3 − Q1', 'IQR ignores the extremes'], 'Draw the ordered data on the board and bracket the middle half.'],
      ['question', 'House prices in a town are strongly skewed. Which center should the news report?', [], 'Expected answer: the median, with a reason about skew.'],
    ],
    study: {
      overview: 'Two numbers summarize most distributions: a center and a spread. The skill is choosing the pair that describes the data honestly.',
      points: [
        ['Mean versus median', 'The mean uses every value, so a single extreme value can drag it far from where most data sits. The median only cares about order, so it stays put. In a symmetric distribution they are close; in a skewed one the mean is pulled toward the tail.'],
        ['Finding the IQR', 'Put the data in order and find the median. The first quartile (Q1) is the median of the lower half and the third quartile (Q3) is the median of the upper half. The IQR is Q3 − Q1, the width of the middle 50% of the data.'],
        ['Choosing a summary', 'For roughly symmetric data without outliers, the mean and a measure like the standard deviation work well. For skewed data or data with outliers, report the median and IQR.'],
      ],
    },
    quiz: [
      { f: 'numeric', p: 'Find the mean of 4, 5, 5, 6, 7, 8, 9.', a: '6.29', e: 'The sum is 44 and there are 7 values, so the mean is 44 ÷ 7 ≈ 6.29.', d: 1 },
      { f: 'numeric', p: 'Find the median of 4, 5, 5, 6, 7, 8, 9, 40.', a: '6.5', e: 'There are 8 values, so the median is the average of the 4th and 5th values: (6 + 7) ÷ 2 = 6.5.', d: 2 },
      { f: 'choice', p: 'Adding one very large value to a data set will usually…', c: ['Raise the mean much more than the median', 'Raise the median much more than the mean', 'Leave both unchanged', 'Lower the mean'], a: 'Raise the mean much more than the median', e: 'The mean uses the size of every value; the median only shifts by at most one position.', d: 2 },
      { f: 'choice', p: 'Which measure of spread is resistant to outliers?', c: ['Range', 'Interquartile range', 'Maximum', 'Mean'], a: 'Interquartile range', e: 'The IQR only uses the middle half of the data, so extreme values do not affect it.', d: 1 },
      { f: 'short', p: 'Salaries at a small company are 30, 32, 35, 36, 38 and 250 thousand dollars. Which center would you report and why?', a: 'The median (35.5 thousand), because the 250 thousand salary is an outlier that pulls the mean up to about 70 thousand.', e: 'Look for the median plus a reason that mentions the outlier or skew.', d: 3 },
    ],
    assignment: {
      title: 'Summarize two data sets',
      prompt: 'Compare the reaction times of two groups using a measure of center and a measure of spread, and explain which summaries you chose.',
      steps: [
        'Order each data set and compute the mean, median, range and IQR.',
        'Decide whether each distribution is roughly symmetric or skewed, and whether it has outliers.',
        'Choose the center and spread you would report for each group and justify the choice.',
        'Write two sentences comparing the groups using your chosen summaries.',
      ],
      criteria: [
        ['Calculations', ['All summaries correct with working shown', 'One small calculation error', 'Several errors or missing working', 'Calculations missing']],
        ['Choice of summary', ['Choices match the shape and outliers, with clear reasons', 'Choices sensible but reasons thin', 'Choices do not match the data', 'No choice made']],
        ['Comparison', ['Compares center and spread in context with units', 'Compares center only, in context', 'Comparison is vague or lacks context', 'No comparison']],
      ],
    },
    discussions: [
      ['A headline says "Average rent rises 20%". What questions would you ask before believing it?', ['Mean or median?', 'Which homes were counted, and over what time?']],
      ['Is it ever fair to leave an outlier out of a summary?', ['What if the outlier is a data entry mistake?', 'What if it is real but rare?']],
    ],
    faq: [
      ['Why does my calculator give a slightly different IQR?', 'There are several conventions for quartiles. Small differences are expected; say which method you used.'],
      ['Should I always use the median?', 'No. When the data is roughly symmetric with no outliers, the mean uses more information and is usually preferred.'],
    ],
  },
  {
    title: 'Samples and bias',
    summary: 'Why we sample, how random sampling protects against bias, and how to spot biased samples in the news.',
    objectives: [
      'Explain the difference between a population and a sample',
      'Identify sources of bias in a sampling method',
    ],
    keyIdeas: [
      'A sample is only useful if it represents the population we care about.',
      'Random selection removes the choice of who is asked from the person asking.',
      'A bigger sample reduces random error but does not fix a biased method.',
    ],
    segments: [
      ['warmup', 'Taste the soup', 5, 'A cook tastes one spoonful to judge a whole pot. When does that work, and when does it fail?', 'Steer toward stirring: a well-mixed pot is like a random sample.'],
      ['teach', 'Populations and samples', 10, 'Define population, sample, and parameter versus statistic with the school lunch example.', ''],
      ['teach', 'How samples go wrong', 12, 'Walk through convenience samples, voluntary response and undercoverage using three short news stories.', 'Use real headlines from your area if you have them.'],
      ['practice', 'Fix the survey', 15, 'Groups receive a flawed survey plan, name the bias and redesign it using random selection.', 'Ask each group to say who is left out by the original plan.'],
      ['close', 'Big is not the same as fair', 8, 'Discuss: an online poll with 50,000 responses versus a random sample of 1,000.', ''],
    ],
    vocabulary: [
      ['Population', 'The whole group we want to learn about.'],
      ['Sample', 'The part of the population we actually collect data from.'],
      ['Bias', 'A systematic tendency for a method to over- or under-estimate the truth.'],
      ['Random sample', 'A sample chosen by chance so that every member of the population has a known chance of being picked.'],
      ['Voluntary response', 'A sample made of people who choose to answer, often those with strong opinions.'],
    ],
    slides: [
      ['title', 'Samples and bias', ['Lesson 4'], ''],
      ['question', 'One spoonful, one pot. When can you trust the taste?', [], 'Let students propose "if it is stirred" before moving on.'],
      ['bullets', 'Population and sample', ['Population: everyone we care about', 'Sample: the people we actually ask', 'Statistics from samples estimate population facts'], ''],
      ['bullets', 'Three common biases', ['Convenience: whoever is easy to reach', 'Voluntary response: whoever chooses to answer', 'Undercoverage: some groups cannot be picked'], ''],
      ['bullets', 'Randomise, then enlarge', ['Random selection fights bias', 'Larger samples reduce random error', 'Size cannot rescue a biased method'], 'Connect back to the 50,000-response online poll.'],
    ],
    study: {
      overview: 'Almost every statistic you read comes from a sample. Knowing how that sample was chosen tells you how far to trust the number.',
      points: [
        ['Why sample at all?', 'Asking everyone is usually too slow or expensive, so we ask some and generalise. That only works when the sample looks like the population in the ways that matter to the question.'],
        ['Spotting bias', 'Ask two questions of any sample: who chose who was included, and who could not be included? Samples where people choose themselves or where the easiest people were asked tend to be biased.'],
        ['Size versus method', 'A larger random sample gives estimates that vary less from sample to sample. A larger biased sample just gives a more confident wrong answer.'],
      ],
    },
    quiz: [
      { f: 'choice', p: 'A radio station asks listeners to phone in their opinion on a new law. What kind of sample is this?', c: ['Simple random sample', 'Voluntary response sample', 'Census', 'Stratified sample'], a: 'Voluntary response sample', e: 'Listeners choose whether to respond, so people with strong opinions are over-represented.', d: 1 },
      { f: 'choice', p: 'Which change would best reduce bias in a survey of students at the school gate at 7:30 am?', c: ['Survey twice as many students at the same time', 'Choose students at random from the full school roll', 'Only survey students who volunteer', 'Ask the questions more quickly'], a: 'Choose students at random from the full school roll', e: 'Early arrivals are not typical of all students; random selection from the whole roll gives everyone a chance.', d: 2 },
      { f: 'truefalse', p: 'True or false: a sample of 50,000 online poll responses is always more trustworthy than a random sample of 1,000.', c: ['True', 'False'], a: 'False', e: 'The large poll is self-selected. A smaller random sample is usually far more representative.', d: 2 },
      { f: 'short', p: 'Researchers want to know how much time teenagers in a city spend online. They survey students in one computer club. Name the bias and suggest a fix.', a: 'This is a convenience sample likely to over-estimate time online, since club members probably use computers more. Randomly select teenagers from schools across the city instead.', e: 'A strong answer names the bias, the likely direction, and a random selection method.', d: 3 },
      { f: 'choice', p: 'In a survey of 200 randomly chosen voters, 54% support a proposal. The 54% is…', c: ['A parameter', 'A statistic', 'A population', 'A bias'], a: 'A statistic', e: 'It describes the sample; the true percentage among all voters is the parameter.', d: 2 },
    ],
    assignment: {
      title: 'Critique a real poll',
      prompt: 'Find a poll or survey reported in the news and write a short critique of how its sample was chosen.',
      steps: [
        'Summarize the poll: the question, the population and the headline result.',
        'Describe how the sample was chosen, using the article or the pollster\'s website.',
        'Identify any possible bias and the direction it would push the result.',
        'Suggest one change to the method that would make you trust it more.',
      ],
      criteria: [
        ['Summary', ['Question, population and result stated accurately', 'Most details present', 'Key details missing', 'Missing']],
        ['Bias analysis', ['Names specific biases and their likely direction', 'Names a bias without direction', 'Vague concerns only', 'No analysis']],
        ['Improvement', ['Specific, practical change using random selection', 'Reasonable change without detail', 'Change would not reduce bias', 'Missing']],
      ],
    },
    discussions: [
      ['If a sample is biased, is the data useless?', ['Could it still tell us something about the people who were asked?', 'How would you report it honestly?']],
      ['Why might people answer a survey untruthfully, and is that a sampling problem?', ['Think about sensitive questions.', 'How is this different from who was asked?']],
    ],
    faq: [
      ['How big does a sample need to be?', 'It depends on how precise you need to be. For many national polls about 1,000 randomly chosen people is enough to be within a few percentage points.'],
      ['Is a census better than a sample?', 'A census asks everyone, so there is no sampling error, but it is slow and costly and can still suffer from people not responding or answering inaccurately.'],
    ],
  },
];
