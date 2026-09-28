import type { LessonSpec } from './builder';

/** Lessons 1–2 of the sample course "Reading the world with data". */
export const statisticsLessonsA: LessonSpec[] = [
  {
    title: 'Asking questions with data',
    summary: 'What makes a question statistical, and the difference between categorical and quantitative variables.',
    objectives: [
      'Tell a statistical question from a non-statistical one',
      'Classify a variable as categorical or quantitative',
    ],
    keyIdeas: [
      'A statistical question expects variability in the answers.',
      'Every data set is a set of cases (who or what) and variables (what we record about them).',
      'Categorical variables sort cases into groups; quantitative variables are measured numbers.',
    ],
    segments: [
      ['warmup', 'Two questions on the board', 5, 'Students vote: "How tall is our teacher?" or "How tall are students in our school?" Which one needs data from many people?', 'Keep the vote quick. The second question is the one that expects variation; name that feeling before defining it.'],
      ['teach', 'What makes a question statistical', 12, 'Define a statistical question as one that anticipates variability. Work through four examples together and sort them.', 'Common slip: "How many pets do I have?" is not statistical, but "How many pets do students in this class have?" is.'],
      ['practice', 'Cases and variables', 15, 'Pairs look at a small table of 8 students (grade, commute mode, minutes to school, favorite subject) and label each column.', 'Push pairs to say why "grade" can be treated as categorical here even though it is written as a number.'],
      ['discuss', 'Write your own', 10, 'Each pair writes one statistical question they could answer about the class, and names the variable it needs.', 'Collect three questions to use as running examples in lesson 2.'],
      ['check', 'Exit ticket', 8, 'Three quick items: one question to classify, two variables to label.', ''],
    ],
    vocabulary: [
      ['Statistical question', 'A question that expects variation in the data used to answer it.'],
      ['Case', 'One individual or object the data describes, such as one student.'],
      ['Variable', 'A characteristic recorded for every case, such as height or commute mode.'],
      ['Categorical variable', 'A variable that places each case into a group or category.'],
      ['Quantitative variable', 'A variable whose values are measured numbers with units.'],
    ],
    slides: [
      ['title', 'Asking questions with data', ['Lesson 1'], 'Open with the two questions on the board before showing this slide.'],
      ['question', 'Which question needs data from many people?', ['How tall is our teacher?', 'How tall are students in our school?'], 'Take a quick show of hands, then ask a student to explain their choice.'],
      ['bullets', 'A statistical question expects variability', ['The answer is not one number', 'Different cases give different values', 'We need data to describe the pattern'], 'Stress "expects": we know before collecting that answers will differ.'],
      ['bullets', 'Cases and variables', ['Case: who or what the data describes', 'Variable: what we record about each case', 'A data table has one row per case'], 'Point to a row and a column of the handout table as you say each line.'],
      ['bullets', 'Two kinds of variable', ['Categorical: puts cases in groups', 'Quantitative: a measured number with units', 'Ask: would an average make sense?'], 'The "average" test is a useful shortcut, but check it against "grade".'],
    ],
    study: {
      overview: 'Statistics starts with a question whose answer varies. This lesson is about noticing that variation and naming the pieces of a data set.',
      points: [
        ['Spotting a statistical question', 'Ask yourself whether you would expect different answers from different people or objects. "What is the boiling point of water at sea level?" has one answer. "How long do students in my class sleep on a school night?" does not, so it is statistical.'],
        ['Cases and variables', 'Picture a spreadsheet. Each row is a case: one student, one day, one city. Each column is a variable: something recorded for every case. Being clear about the case tells you what one row means.'],
        ['Categorical or quantitative?', 'If the values are labels or groups (bus, car, walk), the variable is categorical. If the values are measurements where arithmetic makes sense (12 minutes, 18 minutes), it is quantitative. A number is not always quantitative: a postcode is a label.'],
      ],
    },
    quiz: [
      { f: 'choice', p: 'Which of these is a statistical question?', c: ['How many days are in March?', 'How many hours of sleep did students in our class get last night?', 'What is the capital of Kenya?', 'How tall is the school flagpole?'], a: 'How many hours of sleep did students in our class get last night?', e: 'Only the sleep question expects different answers from different students, so it needs data that varies.', d: 1 },
      { f: 'choice', p: 'A survey records each student\'s favorite sport. What type of variable is "favorite sport"?', c: ['Quantitative', 'Categorical', 'Neither: it is a case', 'Both, depending on the student'], a: 'Categorical', e: 'Each answer places the student in a group such as football or swimming; there is no measured number.', d: 1 },
      { f: 'truefalse', p: 'A phone number is a quantitative variable because it is made of digits.', c: ['True', 'False'], a: 'False', e: 'Phone numbers are labels. Averaging two phone numbers means nothing, so the variable is categorical.', d: 2 },
      { f: 'short', p: 'In a table where each row describes one city, name the case and give one quantitative variable you might record.', a: 'The case is a city. A quantitative variable could be population, area in square kilometers, or average July temperature.', e: 'Any measured number about a city works; labels such as country or climate zone would be categorical.', d: 2 },
      { f: 'choice', p: 'Which variable is quantitative?', c: ['Eye color', 'Minutes spent traveling to school', 'Type of phone', 'Month of birth'], a: 'Minutes spent traveling to school', e: 'Travel time is a measured number with units, so arithmetic such as an average makes sense.', d: 1 },
    ],
    assignment: {
      title: 'Design a class survey',
      prompt: 'Write a short survey you could give to your class to answer one statistical question of your own.',
      steps: [
        'Write your statistical question and explain why the answers will vary.',
        'List the variables your survey will record and label each as categorical or quantitative.',
        'Write the survey questions exactly as a classmate would read them.',
        'Describe one way a badly worded question could give you misleading data.',
      ],
      criteria: [
        ['Statistical question', ['Clearly anticipates variability and is answerable with class data', 'Anticipates variability but is vague about who is asked', 'Could be answered with a single fact', 'Missing or not a question']],
        ['Variables', ['All variables named and correctly classified with reasons', 'Variables named and mostly classified correctly', 'Some variables missing or misclassified', 'Variables not identified']],
        ['Survey wording', ['Neutral, clear questions a classmate can answer without help', 'Mostly clear, one question could confuse', 'Several questions are leading or unclear', 'Survey questions missing']],
      ],
    },
    discussions: [
      ['Is "How many students walk to school?" a statistical question? What would you need to decide first?', ['Which students: our class, our school, or every school in the city?', 'Would the answer change from day to day?']],
      ['Can a variable be categorical in one study and quantitative in another?', ['Think about age recorded as "under 13 / 13–15 / over 15" versus in years.', 'What do we lose when we group numbers into categories?']],
    ],
    faq: [
      ['Is a yes/no question statistical?', 'It can be. "Do students in our school own a pet?" gathers many yes/no answers that vary, so it is statistical. The variable it records is categorical.'],
      ['Is a number always a quantitative variable?', 'No. If the number is a label, such as a jersey number or postcode, it is categorical. Ask whether an average would mean anything.'],
    ],
  },
  {
    title: 'Picturing a distribution',
    summary: 'Using dot plots and histograms to see the shape, center and spread of quantitative data.',
    objectives: [
      'Draw a dot plot and a histogram from a small data set',
      'Describe a distribution by its shape, center, spread and unusual values',
    ],
    keyIdeas: [
      'A distribution shows which values a variable takes and how often.',
      'Describe every distribution with shape, center, spread and outliers.',
      'Histograms group values into equal-width bins; the choice of bin width changes the picture.',
    ],
    segments: [
      ['warmup', 'Guess the class', 5, 'Show a dot plot of commute times without a title. Students guess what it shows and who the cases are.', 'Reveal the answer only after two or three guesses; the point is reading the picture.'],
      ['teach', 'Dot plots and histograms', 12, 'Build a dot plot of the class commute data live, then regroup it into a histogram with 10-minute bins.', 'Keep the same axis for both so students see the histogram as a summary of the dots.'],
      ['practice', 'Shape, center, spread', 15, 'Groups get four histograms (symmetric, skewed right, skewed left, two peaks) and write a two-sentence description of each.', 'Model one description first: "Skewed right, centered around 15 minutes, most values between 5 and 30, one outlier near 60."'],
      ['discuss', 'Bin width matters', 10, 'Show the same data with bins of 2, 10 and 30 minutes. Which picture is honest? Which hides the story?', ''],
      ['close', 'One-sentence summary', 8, 'Each student writes one sentence describing the class commute distribution.', ''],
    ],
    vocabulary: [
      ['Distribution', 'The values a variable takes and how often it takes each one.'],
      ['Dot plot', 'A graph with one dot per case placed above a number line.'],
      ['Histogram', 'A bar graph of counts of quantitative values grouped into equal-width bins.'],
      ['Skewed', 'Stretched out more on one side; a right-skewed distribution has a long tail of high values.'],
      ['Outlier', 'A value that falls far from the overall pattern of the data.'],
    ],
    slides: [
      ['title', 'Picturing a distribution', ['Lesson 2'], ''],
      ['question', 'What could this graph be showing?', ['Look at the axis values', 'Who might the cases be?'], 'Show the untitled dot plot of commute times beside this slide.'],
      ['bullets', 'Dot plots', ['One dot per case', 'Stack dots with the same value', 'Best for small data sets'], ''],
      ['bullets', 'Histograms', ['Group values into equal-width bins', 'Bar height is the count in each bin', 'Bars touch: the scale is continuous'], 'Contrast with bar charts for categorical data, where bars are separated.'],
      ['bullets', 'Describe with SOCS', ['Shape: symmetric, skewed, peaks', 'Outliers: anything unusual?', 'Center: a typical value', 'Spread: how far values range'], 'SOCS is a memory aid; the order matters less than covering all four.'],
    ],
    study: {
      overview: 'A graph of one variable is a picture of its distribution. Learning to read that picture in four words (shape, outliers, center, spread) is the core skill of this lesson.',
      points: [
        ['From dots to bars', 'A dot plot keeps every value visible. A histogram counts how many values fall into each bin. With lots of data, histograms are easier to read; with a handful of values, dot plots lose less information.'],
        ['Reading shape', 'If the left and right sides look roughly like mirror images, the distribution is symmetric. A long tail to the right is right-skewed, common for things like income or commute time that cannot go below zero but can be very large.'],
        ['Bin width changes the story', 'Very narrow bins make a spiky picture full of noise; very wide bins hide real features such as two peaks. Try more than one width before deciding what the data says.'],
      ],
    },
    quiz: [
      { f: 'choice', p: 'A histogram of household incomes has a long tail of high values. How is its shape best described?', c: ['Symmetric', 'Skewed left', 'Skewed right', 'Uniform'], a: 'Skewed right', e: 'The tail points toward the high values on the right, so the distribution is skewed right.', d: 2 },
      { f: 'choice', p: 'Why do the bars of a histogram touch?', c: ['To save space on the page', 'Because the variable is measured on a continuous scale', 'Because every bin has the same count', 'Because the data is categorical'], a: 'Because the variable is measured on a continuous scale', e: 'Bins cover neighbouring intervals of a number line with no gaps between them.', d: 2 },
      { f: 'numeric', p: 'A dot plot shows these quiz scores: 6, 7, 7, 8, 8, 8, 9, 10. How many students scored 8 or more?', a: '5', e: 'Three students scored 8, one scored 9 and one scored 10: 3 + 1 + 1 = 5.', d: 1 },
      { f: 'truefalse', p: 'Changing the bin width of a histogram can hide a second peak in the data.', c: ['True', 'False'], a: 'True', e: 'Wide bins merge neighbouring values, so two separate clusters can blend into one bar.', d: 2 },
      { f: 'short', p: 'Describe the shape, center and spread of this data in one sentence: 2, 3, 3, 4, 4, 4, 5, 5, 6, 19.', a: 'Roughly symmetric from 2 to 6 with a center near 4, plus one high outlier at 19.', e: 'A good answer names the shape, a typical value, the range of most values and the outlier.', d: 3 },
    ],
    assignment: {
      title: 'Graph and describe our class data',
      prompt: 'Using the class commute data, make a dot plot and a histogram and write a paragraph describing the distribution.',
      steps: [
        'Draw a dot plot of the commute times with a labeled axis.',
        'Draw a histogram with a bin width you choose, and explain your choice.',
        'Write a paragraph describing shape, outliers, center and spread.',
      ],
      criteria: [
        ['Graphs', ['Both graphs accurate, labeled, with sensible scales', 'Both graphs present with minor labeling errors', 'One graph missing or inaccurate', 'No usable graph']],
        ['Description', ['Covers shape, outliers, center and spread using the data', 'Covers three of the four features', 'Covers one or two features', 'No description']],
        ['Bin width reasoning', ['Explains the choice and what another width would hide', 'Explains the choice briefly', 'States a width without reasoning', 'Missing']],
      ],
    },
    discussions: [
      ['Two histograms of the same data tell different stories. Which one should a newspaper print?', ['Who benefits from each version?', 'What would you add to the caption to keep it honest?']],
    ],
    faq: [
      ['How many bins should a histogram have?', 'There is no single rule. Start with 5 to 10 bins for a class-sized data set, then try a wider and narrower width to see which features stay.'],
      ['What is the difference between a bar chart and a histogram?', 'A bar chart shows categories, so its bars are separated. A histogram shows a quantitative variable in number-line bins, so its bars touch.'],
    ],
  },
];
